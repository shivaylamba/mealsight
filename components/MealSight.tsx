'use client';

import { useCallback, useRef, useState } from 'react';
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
    return { message: 'That request could not finish.', code: 'error' };
  }
}

export default function MealSight() {
  const [image, setImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; based_on: string[] } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  const pickImage = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setFailure({ message: 'That image is too large. Use one under 12 MB.', code: 'too_large' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  async function analyse(withDescription: string = description) {
    setBusy('Reading the meal…');
    setFailure(null);
    setResult(null);
    setAnswer(null);
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

  async function ask() {
    if (!result || !question.trim()) return;
    setBusy('Asking…');
    setFailure(null);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foods: result.foods, question: question.trim() }),
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
    setBusy('Preparing audio…');
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
        setBusy('Transcribing…');
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
      .filter((item) => answers[item.id] && answers[item.id] !== 'Not sure')
      .map((item) => `${item.question} ${answers[item.id]}`);
    if (!answered.length) return;
    const combined = [description.trim(), ...answered].filter(Boolean).join(' ');
    setDescription(combined);
    await analyse(combined);
  }

  const canAnalyse = Boolean(image || description.trim()) && busy === null;
  const answeredCount = result
    ? result.questions.filter((item) => answers[item.id] && answers[item.id] !== 'Not sure').length
    : 0;

  return (
    <>
      {failure && (
        <p className="banner error" role="alert">
          {failure.message}
        </p>
      )}

      <section className="card">
        <label htmlFor="photo">Photograph</label>
        <input
          id="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => pickImage(event.target.files?.[0])}
        />
        {image && <img className="preview" src={image} alt="The meal you selected" />}

        <div style={{ marginTop: 18 }}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            rows={3}
            maxLength={2000}
            value={description}
            placeholder="Rice, dal and a vegetable sabzi. Two ladles of dal."
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="row">
          <button className="primary" disabled={!canAnalyse} onClick={() => void analyse()}>
            {busy === 'Reading the meal…' ? 'Reading…' : 'Analyse this meal'}
          </button>
          <button onClick={() => void toggleRecording()} disabled={busy !== null && !recording}>
            {recording ? 'Stop recording' : 'Describe by voice'}
          </button>
          {busy && (
            <span className="meta" role="status">
              {busy}
            </span>
          )}
        </div>
      </section>

      {result && (
        <section className="card" aria-live="polite">
          <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>
            {result.status === 'ready' ? 'What we found' : 'Check this before you trust it'}
          </h2>
          <p className="meta" style={{ marginBottom: 10 }}>
            Overall confidence {Math.round(result.overall_confidence * 100)}%.
          </p>

          {result.questions.map((item) => (
            <div className="banner ask" key={item.id}>
              <p style={{ margin: 0, fontWeight: 600 }}>{item.question}</p>
              <div className="chips">
                {[...item.options, 'Not sure'].map((option) => (
                  <button
                    key={option}
                    aria-pressed={answers[item.id] === option}
                    onClick={() => setAnswers((current) => ({ ...current, [item.id]: option }))}
                  >
                    {answers[item.id] === option ? `✓ ${option}` : option}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {answeredCount > 0 && (
            <div className="row" style={{ marginTop: 0, marginBottom: 14 }}>
              <button
                className="primary"
                disabled={busy !== null}
                onClick={() => void reanalyseWithAnswers()}
              >
                Read it again with {answeredCount === 1 ? 'my answer' : 'my answers'}
              </button>
            </div>
          )}

          {result.foods.map((food) => {
            const label = confidenceLabel(food.confidence);
            return (
              <article className="food" key={`${food.name}-${food.lookup_query}`}>
                <h3>
                  {food.name}
                  <span className={`confidence ${label.className}`}>
                    {label.text} · {Math.round(food.confidence * 100)}%
                  </span>
                </h3>
                <p className="meta">
                  {portionText(food)}
                  {food.preparation ? ` · ${food.preparation}` : ''}
                </p>
                {food.hidden_components.length > 0 && (
                  <ul className="hidden-components">
                    {food.hidden_components.map((component) => (
                      <li key={component}>Possibly includes {component}</li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}

          {result.notes.length > 0 && (
            <ul className="hidden-components">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {result && (
        <section className="card">
          <label htmlFor="question">Ask about this meal</label>
          <input
            id="question"
            type="text"
            maxLength={500}
            value={question}
            placeholder="Which of these has the most protein?"
            onChange={(event) => setQuestion(event.target.value)}
          />
          <div className="row">
            <button disabled={!question.trim() || busy !== null} onClick={() => void ask()}>
              Ask
            </button>
            {answer && (
              <button onClick={() => void readAloud(answer.answer)} disabled={busy !== null}>
                Read aloud
              </button>
            )}
          </div>
          {answer && (
            <div aria-live="polite">
              <p style={{ marginBottom: 4 }}>{answer.answer}</p>
              {answer.based_on.length > 0 && (
                <p className="meta">Based on {answer.based_on.join(', ')}.</p>
              )}
            </div>
          )}
          {audioUrl && (
            // The same words are on screen directly above, so the audio is a
            // convenience rather than the only way to receive the answer.
            <audio controls src={audioUrl} aria-label="The answer read aloud" />
          )}
        </section>
      )}
    </>
  );
}
