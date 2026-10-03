import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { IconArrowLeft, IconCheck, IconRefresh } from '@tabler/icons-react';
import { checkAliasAvailable, updateUserProfile } from '../lib/api';
import { isValidPhilippineMobile } from '../lib/phPhone';
import { cleanError } from '../lib/dates';
import { logScreenView } from '../lib/analytics';
import { useReveal } from '../lib/motion';
import { useSession } from '../state/session';

const ALIAS_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

type AliasState = { tone: 'ok' | 'error' | 'checking'; text: string } | null;

export function Profile() {
  const [params] = useSearchParams();
  const from = params.get('from') ?? 'onboarding';
  const next = params.get('next') || '/';
  const isEdit = from === 'home';
  const navigate = useNavigate();
  const { status, error, me, account, ensureToken, setMe, refresh } = useSession();
  const scope = useRef<HTMLDivElement>(null);

  const [phone, setPhone] = useState('');
  const [alias, setAlias] = useState('');
  const [aliasState, setAliasState] = useState<AliasState>(null);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const filled = useRef(false);

  useReveal(scope, [status === 'ready']);
  useEffect(() => logScreenView('Profile'), []);

  // Fill the form once from /me.
  useEffect(() => {
    if (!account || filled.current) return;
    filled.current = true;
    setAlias(account.alias ?? '');
    setPhone(account.placeholderPhone ? '' : (account.phone ?? ''));
  }, [account]);

  // Check alias availability while typing (debounced).
  useEffect(() => {
    const a = alias.trim();
    if (a.length < 3 || a === account?.alias) {
      setAliasState(null);
      return;
    }
    if (!ALIAS_PATTERN.test(a)) {
      setAliasState({ tone: 'error', text: 'Use 3 to 20 letters, numbers or underscores.' });
      return;
    }
    setAliasState({ tone: 'checking', text: 'Checking…' });
    const t = window.setTimeout(async () => {
      try {
        const r = await checkAliasAvailable(a);
        if (r.available) setAliasState({ tone: 'ok', text: `${a} is available.` });
        else if (r.reason === 'reserved') setAliasState({ tone: 'error', text: 'That alias is reserved. Try another one.' });
        else if (r.reason === 'invalid') setAliasState({ tone: 'error', text: 'Use 3 to 20 letters, numbers or underscores.' });
        else setAliasState({ tone: 'error', text: 'Someone already has that alias. Try another one.' });
      } catch {
        setAliasState(null);
      }
    }, 450);
    return () => window.clearTimeout(t);
  }, [alias, account?.alias]);

  if (status === 'loading' && !account) {
    return (
      <div className="center-state" aria-busy="true">
        <span className="spinner" aria-hidden />
        <p>Loading your profile…</p>
      </div>
    );
  }

  if (!account || !me) {
    return (
      <div className="container container--narrow page">
        <div className="notice notice--danger" role="alert">
          <IconRefresh size={22} aria-hidden />
          <div>
            <strong>We couldn't load your profile</strong>
            <p>{error ?? 'Check your connection.'}</p>
            <div className="notice__actions">
              <button type="button" className="btn btn--primary" onClick={() => void refresh()}>
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Gate visits only: a complete profile goes straight on.
  if (!isEdit && !account.needsProfile && !saving) {
    return <Navigate to={next} replace />;
  }

  const needsPhone = account.placeholderPhone;
  const phoneOk = !needsPhone || isValidPhilippineMobile(phone);
  const aliasOk = ALIAS_PATTERN.test(alias.trim()) && aliasState?.tone !== 'error';
  const canSave = phoneOk && aliasOk && !saving;
  const showPhoneError = needsPhone && phoneTouched && phone.trim() !== '' && !phoneOk;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const token = await ensureToken();
      const updated = await updateUserProfile(token, {
        alias: alias.trim(),
        phone: needsPhone ? phone.trim() : undefined,
      });
      setMe(updated);
      navigate(isEdit ? '/' : next, { replace: true });
    } catch (err) {
      setSaveError(cleanError(err, "We couldn't save your profile. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const lead = isEdit
    ? 'Change your alias here. Your mobile number stays linked to your account.'
    : 'Add your mobile number and pick an alias. You do this once, then you go to Home.';

  return (
    <div className="container container--narrow page" ref={scope}>
      {isEdit ? (
        <Link to="/" className="back-link">
          <IconArrowLeft size={18} aria-hidden /> Home
        </Link>
      ) : null}
      <header className="page-head" data-reveal>
        <span className="card__eyebrow">{isEdit ? 'Account' : 'Step 2 of 2'}</span>
        <h1>{isEdit ? 'Edit profile' : 'Set up your profile'}</h1>
        <p>{lead}</p>
      </header>

      <form className="card stack" onSubmit={onSubmit} noValidate data-reveal>
        {needsPhone ? (
          <div className="field">
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              className="input tnum"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="09171234567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhoneTouched(true)}
              aria-invalid={showPhoneError}
              aria-describedby="phone-hint"
              disabled={saving}
              required
            />
            <p id="phone-hint" className={showPhoneError ? 'hint hint--error' : 'hint'}>
              {showPhoneError
                ? 'Enter a Philippine mobile number, like 09171234567 or +63 917 123 4567.'
                : 'Philippine mobile only. We use it to tell accounts apart.'}
            </p>
          </div>
        ) : (
          <div className="field">
            <span className="label">Mobile number</span>
            <div className="input input--readonly tnum">{account.phone ?? '—'}</div>
          </div>
        )}

        <div className="field">
          <label htmlFor="alias">Alias</label>
          <input
            id="alias"
            className="input"
            autoComplete="nickname"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Lucky_Juan_3"
            maxLength={20}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            aria-invalid={aliasState?.tone === 'error'}
            aria-describedby="alias-hint"
            disabled={saving}
            required
          />
          <p
            id="alias-hint"
            aria-live="polite"
            className={
              aliasState?.tone === 'error' ? 'hint hint--error' : aliasState?.tone === 'ok' ? 'hint hint--ok' : 'hint'
            }
          >
            {aliasState?.text ?? '3 to 20 characters: letters, numbers and underscores. Other players never see your number.'}
          </p>
        </div>

        {saveError ? (
          <p className="hint hint--error" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="row" style={{ justifyContent: 'flex-end', paddingTop: 8 }}>
          {isEdit ? (
            <Link to="/" className="btn btn--ghost">
              Cancel
            </Link>
          ) : null}
          <button type="submit" className="btn btn--primary btn--lg" disabled={!canSave} aria-busy={saving}>
            {saving ? <span className="spinner" aria-hidden /> : <IconCheck size={20} aria-hidden />}
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save and continue'}
          </button>
        </div>
      </form>
    </div>
  );
}
