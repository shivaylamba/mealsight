'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Mic,
  RotateCcw,
  Send,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import type { Food } from '@/lib/schema';

type Question = { id: string; question: string; options: string[] };

type Result = {
  status: 'needs_confirmation' | 'ready';
  foods: Food[];
  questions: Question[];
  notes: string[];
  overall_confidence: number;
};

type Failure = { message: string; code: string };

type Busy = 'analysing' | 'asking' | 'speaking' | 'transcribing' | null;

const NOT_SURE = 'Not sure';

/** Models often offer their own "unsure"; the page always adds one, so drop theirs. */
function answerOptions(options: string[]): string[] {
  const unsure = /^(unsure|not sure|don'?t know|unknown|no idea)$/i;
  return [...options.filter((option) => !unsure.test(option.trim())), NOT_SURE];
}

function confidenceLabel(value: number): { text: string; className: string } {
  if (value >= 0.75) return { text: 'confident', className: 'high' };
  if (value >= 0.4) return { text: 'unsure', className: 'medium' };
  return { text: 'guessing', className: 'low' };
}

function portionText(food: Food): string {
  if (food.estimated_grams === null && food.portion_range === null) return 'Portion unknown';
  if (food.portion_range && food.estimated_grams !== null)
    return `About ${Math.round(food.estimated_grams)} g (${Math.round(food.portion_range.min_grams)}–${Math.round(food.portion_range.max_grams)} g)`;
  if (food.estimated_grams !== null) return `About ${Math.round(food.estimated_grams)} g`;
  return `Between ${Math.round(food.portion_range!.min_grams)} and ${Math.round(food.portion_range!.max_grams)} g`;
}

/** Read an error body without assuming it is JSON; a proxy may return HTML. */
async function failureFrom(response: Response): Promise<Failure> {
  try {
    const body = (await response.json()) as { error?: string; code?: string };
    return {
      message: body.error ?? 'That request could not finish.',
      code: body.code ?? 'error',
    };
  } catch {
    // The host answered before the app did, so only the status is meaningful.
    if (response.status === 413)
      return { message: 'That image is too large to send. Try a smaller one.', code: 'too_large' };
    if (response.status === 504)
      return { message: 'The model took too long to answer. Try again.', code: 'timeout' };
    return { message: 'That request could not finish.', code: 'error' };
  }
}

/**
 * The longest edge sent to the model. Hosts cap request bodies (Vercel at
 * 4.5 MB), and a phone photo or Retina screenshot is often larger than that
 * once base64-encoded. Vision models downscale to about this size anyway, so
 * shrinking here loses nothing the model would have seen.
 */
const MAX_EDGE = 1568;

async function prepareImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  // JPEG has no transparency; a white ground keeps transparent PNGs readable.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

/** Seconds since `active` became true, for a wait that can run to a minute. */
function useElapsed(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return elapsed;
}

/**
 * The portion drawn to a shared scale, so a 20 g garnish and a 250 g curry
 * look like what they are, and the width of the band shows the uncertainty.
 */
function PortionBar({ food, scale }: { food: Food; scale: number }) {
  if (!food.portion_range && food.estimated_grams === null) return null;
  const min = food.portion_range?.min_grams ?? food.estimated_grams!;
  const max = food.portion_range?.max_grams ?? food.estimated_grams!;
  const pct = (grams: number) => `${Math.min(100, (grams / scale) * 100)}%`;
  return (
    <div className="portion-bar" aria-hidden="true">
      <span
        className="portion-band"
        style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }}
      />
      {food.estimated_grams !== null && (
        <span className="portion-mark" style={{ left: pct(food.estimated_grams) }} />
      )}
    </div>
  );
}

const SUGGESTIONS = [
  'Is this a balanced meal?',
  'What is the biggest unknown here?',
  'What could I add for more protein?',
];

export default function MealSight() {
  const [image, setImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; based_on: string[] } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [dragging, setDragging] = useState(false);
  const elapsed = useElapsed(busy === 'analysing');

  const pickImage = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setFailure({ message: 'That image is too large. Use one under 25 MB.', code: 'too_large' });
      return;
    }
    setFailure(null);
    prepareImage(file).then(setImage, () =>
      setFailure({
        message: 'That file could not be read as an image. Try a JPEG or PNG.',
        code: 'unreadable_image',
      }),
    );
  }, []);

  function clearImage() {
    setImage(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function analyse(withDescription: string = description) {
    setBusy('analysing');
    setFailure(null);
    setResult(null);
    setAnswer(null);
    setAudioUrl(null);
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, description: withDescription.trim() || null }),
      });
      if (!response.ok) {
        setFailure(await failureFrom(response));
        return;
      }
      setResult((await response.json()) as Result);
      setAnswers({});
    } catch {
      setFailure({ message: 'The network is unavailable. Try again.', code: 'network' });
    } finally {
      setBusy(null);
    }
  }

  async function ask(text: string = question) {
    if (!result || !text.trim()) return;
    setQuestion(text);
    setBusy('asking');
    setFailure(null);
    setAudioUrl(null);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foods: result.foods, question: text.trim() }),
      });
      if (!response.ok) {
        setFailure(await failureFrom(response));
        return;
      }
      setAnswer((await response.json()) as { answer: string; based_on: string[] });
    } catch {
      setFailure({ message: 'The network is unavailable. Try again.', code: 'network' });
    } finally {
      setBusy(null);
    }
  }

  async function readAloud(text: string) {
    setBusy('speaking');
    setFailure(null);
    try {
      const response = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        setFailure(await failureFrom(response));
        return;
      }
      const body = (await response.json()) as { audio_base64: string; mime_type: string };
      setAudioUrl(`data:${body.mime_type};base64,${body.audio_base64}`);
    } catch {
      setFailure({ message: 'The network is unavailable. Try again.', code: 'network' });
    } finally {
      setBusy(null);
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
      return;
    }
    setFailure(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const media = new MediaRecorder(stream);
      media.ondataavailable = (event) => chunks.push(event.data);
      media.onstop = async () => {
        for (const track of stream.getTracks()) track.stop();
        setBusy('transcribing');
        try {
          const response = await fetch('/api/voice/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'audio/wav' },
            body: new Blob(chunks),
          });
          if (!response.ok) {
            setFailure(await failureFrom(response));
            return;
          }
          const body = (await response.json()) as { text: string };
          setDescription((current) => (current ? `${current} ${body.text}` : body.text));
        } finally {
          setBusy(null);
        }
      };
      recorder.current = media;
      media.start();
      setRecording(true);
    } catch {
      // Denied or unavailable: the typed description is always there.
      setFailure({
        message: 'Microphone access was not granted. Describe the meal instead.',
        code: 'no_microphone',
      });
    }
  }

  /**
   * Asking a question and then ignoring the reply would be worse than not
   * asking. The answers are folded back into the description and the meal is
   * read again, so a correction actually changes the result.
   */
  async function reanalyseWithAnswers() {
    if (!result) return;
    const answered = result.questions
      .filter((item) => answers[item.id] && answers[item.id] !== NOT_SURE)
      .map((item) => `${item.question} ${answers[item.id]}`);
    if (!answered.length) return;
    const combined = [description.trim(), ...answered].filter(Boolean).join(' ');
    setDescription(combined);
    await analyse(combined);
  }

  const canAnalyse = Boolean(image || description.trim()) && busy === null && !recording;
  const answeredCount = result
    ? result.questions.filter((item) => answers[item.id] && answers[item.id] !== NOT_SURE).length
    : 0;
  // Rounded up to a round number with headroom, so no band runs into the
  // edge and the axis label reads as a scale rather than a coincidence.
  const scale = result
    ? Math.ceil(
        (Math.max(
          80,
          ...result.foods.map((food) => food.portion_range?.max_grams ?? food.estimated_grams ?? 0),
        ) *
          1.1) /
          50,
      ) * 50
    : 100;

  return (
    <div className="workspace">
      <section className="panel capture" aria-labelledby="capture-title">
        <div className="panel-head">
          <p className="eyebrow">01 / Your meal</p>
          <h2 id="capture-title">Show or tell</h2>
        </div>

        <input
          ref={fileInput}
          id="photo"
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => pickImage(event.target.files?.[0])}
        />
        {image ? (
          <figure className="photo">
            <img src={image} alt="The meal you selected" />
            <div className="photo-actions">
              <label htmlFor="photo" className="chip-button">
                <Camera size={15} aria-hidden="true" /> Replace
              </label>
              <button type="button" className="chip-button" onClick={clearImage}>
                <X size={15} aria-hidden="true" /> Remove
              </button>
            </div>
          </figure>
        ) : (
          <label
            htmlFor="photo"
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pickImage(event.dataTransfer.files?.[0]);
            }}
          >
            <span className="dropzone-icon">
              <ImagePlus size={22} aria-hidden="true" />
            </span>
            <span className="dropzone-title">Add a photo of the meal</span>
            <span className="dropzone-hint">
              Drop it here or click to choose · JPEG, PNG or WebP
            </span>
          </label>
        )}

        <div className="field">
          <label htmlFor="description">Describe it</label>
          <div className="textarea-wrap">
            <textarea
              id="description"
              rows={4}
              maxLength={2000}
              value={description}
              placeholder="Rice, dal and a vegetable sabzi. Two ladles of dal."
              onChange={(event) => setDescription(event.target.value)}
            />
            <button
              type="button"
              className={`mic${recording ? ' live' : ''}`}
              onClick={() => void toggleRecording()}
              disabled={busy !== null && !recording}
              aria-pressed={recording}
              aria-label={recording ? 'Stop recording' : 'Describe by voice'}
              title={recording ? 'Stop recording' : 'Describe by voice'}
            >
              {recording ? (
                <Square size={14} aria-hidden="true" />
              ) : (
                <Mic size={17} aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="field-hint" role="status">
            {recording
              ? 'Listening… tap the square when you are done.'
              : busy === 'transcribing'
                ? 'Transcribing…'
                : 'A photo and a sentence together read best.'}
          </p>
        </div>

        <button
          type="button"
          className="button primary block"
          disabled={!canAnalyse}
          onClick={() => void analyse()}
        >
          {busy === 'analysing' ? (
            <>
              <Loader2 size={17} className="spin" aria-hidden="true" /> Reading the meal…
            </>
          ) : (
            <>
              Analyse this meal <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
      </section>

      <section className="results" aria-live="polite" aria-busy={busy === 'analysing'}>
        {failure && (
          <div className="alert" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <p>{failure.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => setFailure(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}

        {busy === 'analysing' && (
          <div className="panel loading">
            <div className="progress" />
            <p className="eyebrow">02 / Reading</p>
            <h2>Looking at the plate…</h2>
            <p className="muted">
              {image
                ? 'Photos usually take 30 to 45 seconds.'
                : 'Descriptions usually take a few seconds.'}{' '}
              <span className="tabular">{elapsed}s</span>
            </p>
            <div className="skeleton-list" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {!result && busy !== 'analysing' && (
          <div className="panel empty">
            <p className="eyebrow">02 / Result</p>
            <h2>Your breakdown appears here.</h2>
            <ol className="empty-steps">
              <li>
                <span>1</span> Every food, with a portion range
              </li>
              <li>
                <span>2</span> The model&rsquo;s own confidence for each
              </li>
              <li>
                <span>3</span> A question wherever it is unsure
              </li>
            </ol>
            <p className="muted small">
              Foods and portions only. MealSight never estimates calories.
            </p>
          </div>
        )}

        {result && busy !== 'analysing' && (
          <>
            <div className="panel">
              <div className="result-head">
                <div>
                  <p className="eyebrow">02 / Result</p>
                  <h2>
                    {result.status === 'ready'
                      ? 'Here is what we found.'
                      : 'Check this before you trust it.'}
                  </h2>
                </div>
                <div
                  className="meter"
                  aria-label={`Overall confidence ${Math.round(result.overall_confidence * 100)}%`}
                >
                  <span className="meter-value">
                    {Math.round(result.overall_confidence * 100)}%
                  </span>
                  <span className="meter-label">overall confidence</span>
                  <span className="meter-track">
                    <span style={{ width: `${Math.round(result.overall_confidence * 100)}%` }} />
                  </span>
                </div>
              </div>

              {result.questions.length > 0 && (
                <div className="questions">
                  {result.questions.map((item) => (
                    <fieldset className="question" key={item.id}>
                      <legend>{item.question}</legend>
                      <div className="chips">
                        {answerOptions(item.options).map((option) => (
                          <button
                            type="button"
                            key={option}
                            className={answers[item.id] === option ? 'chip selected' : 'chip'}
                            aria-pressed={answers[item.id] === option}
                            onClick={() =>
                              setAnswers((current) => ({ ...current, [item.id]: option }))
                            }
                          >
                            {answers[item.id] === option && <Check size={14} aria-hidden="true" />}
                            {option}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                  {answeredCount > 0 && (
                    <button
                      type="button"
                      className="button primary"
                      disabled={busy !== null}
                      onClick={() => void reanalyseWithAnswers()}
                    >
                      <RotateCcw size={16} aria-hidden="true" />
                      Read it again with {answeredCount === 1 ? 'my answer' : 'my answers'}
                    </button>
                  )}
                </div>
              )}

              <div className="scale-legend" aria-hidden="true">
                <span>Portion range, one scale for every food</span>
                <span className="tabular">0 – {scale} g</span>
              </div>
              <ul className="foods">
                {result.foods.map((food) => {
                  const label = confidenceLabel(food.confidence);
                  return (
                    <li className="food" key={`${food.name}-${food.lookup_query}`}>
                      <div className="food-top">
                        <h3>{food.name}</h3>
                        <span className={`pill ${label.className}`}>
                          {label.text} · {Math.round(food.confidence * 100)}%
                        </span>
                      </div>
                      <p className="food-meta">
                        {portionText(food)}
                        {food.preparation ? ` · ${food.preparation}` : ''}
                      </p>
                      <PortionBar food={food} scale={scale} />
                      {food.hidden_components.length > 0 && (
                        <ul className="tags">
                          {food.hidden_components.map((component) => (
                            <li key={component}>may include {component}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>

              {result.notes.length > 0 && (
                <ul className="notes">
                  {result.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="panel coach">
              <p className="eyebrow">03 / Ask about it</p>
              <h2>Question the breakdown.</h2>
              <div className="suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    className="chip"
                    disabled={busy !== null}
                    onClick={() => void ask(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form
                className="ask-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void ask();
                }}
              >
                <label htmlFor="question" className="visually-hidden">
                  Your question
                </label>
                <input
                  id="question"
                  type="text"
                  maxLength={500}
                  value={question}
                  placeholder="Which of these has the most protein?"
                  onChange={(event) => setQuestion(event.target.value)}
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={!question.trim() || busy !== null}
                  aria-label="Ask"
                >
                  {busy === 'asking' ? (
                    <Loader2 size={17} className="spin" aria-hidden="true" />
                  ) : (
                    <Send size={16} aria-hidden="true" />
                  )}
                </button>
              </form>

              {answer && (
                <div className="answer">
                  <p>{answer.answer}</p>
                  <div className="answer-foot">
                    {answer.based_on.length > 0 && (
                      <p className="muted small">Based on {answer.based_on.join(', ')}</p>
                    )}
                    <button
                      type="button"
                      className="chip-button"
                      onClick={() => void readAloud(answer.answer)}
                      disabled={busy !== null}
                    >
                      {busy === 'speaking' ? (
                        <Loader2 size={15} className="spin" aria-hidden="true" />
                      ) : (
                        <Volume2 size={15} aria-hidden="true" />
                      )}
                      Read aloud
                    </button>
                  </div>
                  {audioUrl && (
                    // The same words are on screen directly above, so the audio is a
                    // convenience rather than the only way to receive the answer.
                    <audio controls autoPlay src={audioUrl} aria-label="The answer read aloud" />
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
