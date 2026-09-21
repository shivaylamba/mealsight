import type { NextConfig } from 'next';

const config: NextConfig = {
  // Images are sent to the model as data URLs and never written to disk, so
  // the request body ceiling is the only size limit that matters here.
  devIndicators: false,
  // Without this, a stray lockfile above the project makes Next trace from the
  // home directory and warn on every start.
  outputFileTracingRoot: import.meta.dirname,
};

export default config;
