import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { IconChevronRight } from '@tabler/icons-react';
import { useReveal } from '../lib/motion';
import { logScreenView } from '../lib/analytics';
import { TIP_TILES } from './Home';

export function Tips() {
  const scope = useRef<HTMLDivElement>(null);
  useReveal(scope);
  useEffect(() => logScreenView('Tips'), []);
  return (
    <div className="container page" ref={scope}>
      <header className="page-head" data-reveal>
        <h1>Tips and tools</h1>
        <p>Daily puzzles and charts to play with alongside your picks. New puzzles every day.</p>
      </header>
      <div className="grid-3">
        {TIP_TILES.map((t) => (
          <Link key={t.to} to={t.to} className="tile" data-reveal>
            <span className="tile__icon" aria-hidden>
              <t.icon size={24} />
            </span>
            <span>
              <strong>{t.title}</strong>
              <span>{t.text}</span>
            </span>
            <IconChevronRight className="tile__go" size={20} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
