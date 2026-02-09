/**
 * TopPage - ランディングページ
 *
 * Maycast Recorderの概要と各モードへの導線を提供する
 */

import { Link } from 'react-router-dom';

export const TopPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-maycast-bg text-maycast-text px-4">
      <div className="maycast-panel backdrop-blur rounded-2xl p-10 max-w-lg w-full text-center space-y-8">
        {/* Branding */}
        <div>
          <h1 className="text-4xl font-bold text-maycast-primary tracking-tight">
            Maycast Recorder
          </h1>
          <p className="mt-3 text-maycast-text-secondary text-sm leading-relaxed">
            WebCodecs-based video/audio recorder with OPFS storage and real-time server synchronization.
          </p>
        </div>

        {/* Navigation Buttons */}
        <div className="flex flex-col gap-4">
          <Link
            to="/solo"
            className="block w-full px-6 py-3 bg-maycast-primary text-white font-semibold rounded-xl hover:bg-maycast-primary/90 transition-colors"
          >
            Solo Mode
          </Link>
          <Link
            to="/director"
            className="block w-full px-6 py-3 bg-maycast-surface border border-maycast-border text-maycast-text font-semibold rounded-xl hover:bg-maycast-surface/80 transition-colors"
          >
            Director Mode
          </Link>
        </div>

        {/* GitHub Link */}
        <div>
          <a
            href="https://github.com/henteko/maycast_recorder"
            target="_blank"
            rel="noopener noreferrer"
            className="text-maycast-text-secondary hover:text-maycast-primary text-sm transition-colors"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
};
