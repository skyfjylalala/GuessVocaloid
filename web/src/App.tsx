import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, AudioLines, Check, ChevronDown, CircleHelp, Copy, Disc3, ExternalLink, Headphones, ListMusic, Music2, RotateCcw, Search, Sparkles, Volume2, X } from 'lucide-react';
import type { Attribute, Catalog, Comparison, GameState, SearchSong, Song } from '../shared/types';
import { createSearchIndex, searchSongs } from '../shared/search';
import { DIFFICULTIES, DIFFICULTY_LIMITS, isDifficulty, type Difficulty } from '../shared/difficulty';
import { translations, type Language } from './i18n';

const GAME_KEY = 'guess-vocaloid:game:v1', STATS_KEY = 'guess-vocaloid:stats:v1';
interface SavedGame { runId: string; game: GameState }
interface Result { id: string; won: boolean; guesses: number; difficulty?: Difficulty }
function readStorage<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? 'SERVICE_UNAVAILABLE');
  return data;
}
function duration(seconds: number | null) { return seconds === null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
function bpm(song: Song) { return song.bpmMin === null || song.bpmMax === null ? '—' : song.bpmMin === song.bpmMax ? String(song.bpmMin) : `${song.bpmMin}–${song.bpmMax}`; }
const attributes: Attribute[] = ['vocalists', 'producers', 'year', 'bpm', 'length'];

function Modal({ title, children, close, wide = false }: { title: string; children: ReactNode; close: () => void; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'modal-wide' : ''}`} onCancel={close} onClick={event => { if (event.target === dialog.current) { const rect = dialog.current!.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close(); } }} aria-labelledby="modal-title">
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={close} aria-label={document.documentElement.lang === 'zh-CN' ? '关闭' : document.documentElement.lang === 'ja' ? '閉じる' : 'Close'}><X size={20} /></button></div>{children}
  </dialog>;
}

export default function App() {
  const [language, setLanguage] = useState<Language>(() => { const saved = readStorage<Language>('guess-vocaloid:language', 'zh'); return ['zh','ja','en'].includes(saved) ? saved : 'zh'; });
  const t = translations[language];
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [saved, setSaved] = useState<SavedGame | null>(null);
  const [preferredDifficulty, setPreferredDifficulty] = useState<Difficulty>(() => {
    const value = readStorage<unknown>('guess-vocaloid:difficulty', 'beginner');
    return isDifficulty(value) ? value : 'beginner';
  });
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty | null>(null);
  const [results, setResults] = useState<Result[]>(() => { const value = readStorage<unknown>(STATS_KEY, []); return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && typeof item.won === 'boolean' && Number.isInteger(item.guesses)) : []; });
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<SearchSong | null>(null);
  const [focused, setFocused] = useState(false), [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [storageWarning, setStorageWarning] = useState(false);
  const [modal, setModal] = useState<'help' | 'catalog' | 'reveal' | 'new' | 'difficulty' | null>(null), [catalogQuery, setCatalogQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const game = saved?.game;
  const difficulty = game?.difficulty ?? preferredDifficulty;
  const poolSongs = useMemo(() => (catalog?.songs ?? []).slice(0, DIFFICULTY_LIMITS[difficulty]), [catalog, difficulty]);
  const index = useMemo(() => createSearchIndex(poolSongs), [poolSongs]);
  const excluded = useMemo(() => new Set(game?.guesses.map(guess => guess.song.id) ?? []), [game]);
  const matches = useMemo(() => searchSongs(index, query, excluded), [index, query, excluded]);
  const catalogMatches = useMemo(() => catalogQuery.trim() ? searchSongs(index, catalogQuery, new Set(), 100) : poolSongs.slice(0, 100), [index, catalogQuery, poolSongs]);
  const showOptions = focused && query.trim().length > 0 && !selected && !busy;

  function persist(next: SavedGame) {
    setSaved(next);
    setPreferredDifficulty(next.game.difficulty);
    try { localStorage.setItem('guess-vocaloid:difficulty', JSON.stringify(next.game.difficulty)); } catch { setStorageWarning(true); }
    try { localStorage.setItem(GAME_KEY, JSON.stringify(next)); } catch { setStorageWarning(true); }
    if (next.game.status !== 'playing') {
      setResults(previous => {
        if (previous.some(result => result.id === next.runId)) return previous;
        const updated = [...previous, { id: next.runId, won: next.game.status === 'won', guesses: next.game.guesses.length, difficulty: next.game.difficulty }];
        try { localStorage.setItem(STATS_KEY, JSON.stringify(updated)); } catch { setStorageWarning(true); }
        return updated;
      });
    }
  }
  async function connect() {
    setBusy(true); setError('');
    try {
      const current = await request<Catalog>('/api/catalog'); setCatalog(current);
      const existing = readStorage<SavedGame | null>(GAME_KEY, null);
      if (existing?.game?.token && typeof existing.runId === 'string') {
        try { persist({ runId: existing.runId, game: await request<GameState>('/api/games/resume', { token: existing.game.token }) }); return; }
        catch (failure) { if (!(failure instanceof Error) || !['INVALID_SESSION', 'CATALOG_CHANGED'].includes(failure.message)) throw failure; }
      }
      persist({ runId: crypto.randomUUID(), game: await request<GameState>('/api/games', { difficulty: preferredDifficulty }) });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'SERVICE_UNAVAILABLE'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void connect(); }, []);
  useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : language; try { localStorage.setItem('guess-vocaloid:language', JSON.stringify(language)); } catch {} }, [language]);
  useEffect(() => { setActiveIndex(0); }, [query]);

  function choose(song: SearchSong) { setSelected(song); setQuery(song.title); setFocused(false); searchInput.current?.focus(); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || !saved || busy || game?.status !== 'playing') return;
    setBusy(true); setError('');
    try {
      const next = await request<GameState>('/api/games/guess', { token: saved.game.token, songId: selected.id });
      persist({ runId: saved.runId, game: next }); setSelected(null); setQuery('');
      window.setTimeout(() => searchInput.current?.focus(), 0);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'SERVICE_UNAVAILABLE'); }
    finally { setBusy(false); }
  }
  async function newGame(nextDifficulty: Difficulty = difficulty) {
    setModal(null); setBusy(true); setError('');
    try {
      persist({ runId: crypto.randomUUID(), game: await request<GameState>('/api/games', { difficulty: nextDifficulty }) });
      setQuery(''); setSelected(null); setCopied(false);
      setCatalogQuery(''); setPendingDifficulty(null);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'SERVICE_UNAVAILABLE'); }
    finally { setBusy(false); }
  }
  function changeDifficulty(next: Difficulty) {
    if (next === difficulty || busy) return;
    if (game?.status === 'playing' && game.guesses.length) { setPendingDifficulty(next); setModal('difficulty'); }
    else void newGame(next);
  }
  async function reveal() {
    if (!saved) return;
    setModal(null); setBusy(true); setError('');
    try { persist({ runId: saved.runId, game: await request<GameState>('/api/games/reveal', { token: saved.game.token }) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'SERVICE_UNAVAILABLE'); }
    finally { setBusy(false); }
  }
  async function share() {
    if (!game) return;
    const emoji: Record<Comparison, string> = { match: '🟩', partial: '🟨', higher: '⬆️', lower: '⬇️', different: '⬜', unknown: '❔' };
    const text = `Guess Vocaloid · ${t.difficultyLabels[difficulty]} · Top ${game.poolSize}\n${game.status === 'won' ? game.guesses.length : 'X'}/${game.maxGuesses}\n\n${game.guesses.map(guess => attributes.map(attr => emoji[guess.feedback[attr]]).join('')).join('\n')}\n\n${location.origin}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2500); }
    catch { setError(language === 'zh' ? '复制失败，请检查浏览器的剪贴板权限。' : language === 'ja' ? 'コピーできません。クリップボードの権限を確認してください。' : 'Could not copy. Check clipboard permissions.'); }
  }
  function comparisonLabel(value: Comparison) { return t[value]; }
  const difficultyResults = results.filter(result => (result.difficulty ?? 'advanced') === difficulty);
  const wins = difficultyResults.filter(result => result.won), guessCount = game?.guesses.length ?? 0;
  const isPlaying = game?.status === 'playing';
  const errorText = error ? t.errors[error] ?? (error.includes(' ') || /[\u3000-\u9fff]/u.test(error) ? error : t.unavailable) : '';
  const needsNew = ['INVALID_SESSION','CATALOG_CHANGED','GAME_FINISHED'].includes(error);

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Guess Vocaloid"><span className="brand-mark"><AudioLines size={22} strokeWidth={2.3} /></span><span>guess<span className="brand-light">vocaloid</span><span className="brand-dot">.</span></span></a>
      <div className="header-actions"><label className="language-select"><span className="sr-only">Language</span><select value={language} onChange={event => setLanguage(event.target.value as Language)} aria-label="Language"><option value="zh">简体中文</option><option value="ja">日本語</option><option value="en">English</option></select><ChevronDown size={13}/></label><span className="header-divider"/><button className="icon-button help-button" onClick={() => setModal('help')} aria-label={t.how}><CircleHelp size={20}/></button></div>
    </header>

    <main className="page-wrap">
      <section className="hero hero-compact">
        <div className="eyebrow"><span className="live-dot"/> VOCAL SYNTH GUESSING GAME <span className="edition">VOL. 01</span></div>
        <div className="record-art" aria-hidden="true"><div className="record-outer"><div className="record-lines"/><div className="record-label"><span>GUESS<br/>VOCALOID</span><i/><small>SIDE A · PLAY AGAIN</small></div></div><div className="record-caption"><span className="tiny-dot"/> PRESS PLAY ON YOUR MEMORY <ArrowRight size={14}/></div><span className="art-star">✳</span></div>
      </section>

      <div className="game-layout">
        <aside className="sidebar">
          <div className="sidebar-intro"><span className="section-kicker">THE GUIDE</span><h2>{t.how}<span>↗</span></h2><p>{t.howSub}</p></div>
          <ol className="steps">{t.steps.map(([title, description], i) => <li key={i}><span className="step-number">0{i+1}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
          <div className="collection-card"><div className="collection-top"><ListMusic size={19}/><span>{t.collection} · {t.difficultyLabels[difficulty]}</span></div><div className="collection-number">{catalog ? poolSongs.length.toLocaleString() : '—'}<span>{t.songs}</span></div><p>{t.collectionDesc}</p><button onClick={() => setModal('catalog')} disabled={!catalog}>{t.browse}<ArrowRight size={15}/></button></div>
          {difficultyResults.length > 0 && <div className="stats"><span className="section-kicker">{t.stats} · {t.difficultyLabels[difficulty]}</span><div className="stats-grid"><div><strong>{difficultyResults.length}</strong><span>{t.played}</span></div><div><strong>{Math.round(wins.length / difficultyResults.length * 100)}<small>%</small></strong><span>{t.winRate}</span></div><div><strong>{wins.length ? (wins.reduce((sum, result) => sum + result.guesses, 0) / wins.length).toFixed(1) : '—'}</strong><span>{t.avgGuesses}</span></div></div></div>}
        </aside>

        <section className="game-panel" aria-label={t.practice}>
          <div className="game-panel-header"><div><span className="mode-pill"><span className="live-dot"/>{t.practice}</span><span className="mode-label">{t.practiceEn}</span></div><div className="game-tools"><button className="icon-button" onClick={() => setModal('catalog')} disabled={!catalog} aria-label={t.browse} title={t.browse}><ListMusic size={18}/></button><button className="icon-button" onClick={() => isPlaying && guessCount ? setModal('new') : void newGame()} disabled={busy} aria-label={t.newGame} title={t.newGame}><RotateCcw size={17}/></button></div></div>
          <fieldset className="difficulty-picker"><legend>{t.difficulty}</legend><div className="difficulty-options">{DIFFICULTIES.map(level => <button key={level} type="button" aria-pressed={difficulty === level} disabled={busy} onClick={() => changeDifficulty(level)}><span>{t.difficultyLabels[level]}</span><small>Top {DIFFICULTY_LIMITS[level].toLocaleString()}</small></button>)}</div><p>{t.poolHint}</p></fieldset>
          <div className="round-progress"><div><span className="section-kicker">{t.round}</span><div className="attempt-count"><strong>{String(guessCount).padStart(2,'0')}</strong><span>/ 08</span><small>{t.chances}</small></div></div><div className="attempt-dots" aria-label={`${guessCount} / 8`}>{Array.from({length:8}, (_, i) => <span key={i} className={i < guessCount ? game?.status === 'won' && i === guessCount-1 ? 'dot-won' : 'dot-used' : ''}/>)}</div></div>

          {error && <div className="error-banner" role="alert"><span>{errorText}</span><button onClick={() => needsNew ? void newGame() : void connect()} disabled={busy}>{needsNew ? t.newGame : t.retry}<ArrowRight size={14}/></button></div>}
          {storageWarning && <p className="storage-warning" role="status">{t.storageError}</p>}
          {(!game || isPlaying) && <form className="guess-form" onSubmit={submit}>
            <div className="search-box"><Search size={20}/><input ref={searchInput} type="text" value={query} disabled={busy || !game} placeholder={busy && !game ? t.loading : t.placeholder} role="combobox" aria-autocomplete="list" aria-expanded={showOptions} aria-controls="song-options" aria-activedescendant={showOptions && matches.length ? `song-option-${activeIndex}` : undefined} aria-label={t.placeholder} autoComplete="off" onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 150)} onChange={event => { setQuery(event.target.value); setSelected(null); setFocused(true); }} onKeyDown={event => { if (event.key === 'Escape') { setFocused(false); return; } if (!showOptions || !matches.length) return; if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(i => (i+1) % matches.length); } else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(i => (i+matches.length-1) % matches.length); } else if (event.key === 'Enter') { event.preventDefault(); choose(matches[Math.min(activeIndex, matches.length-1)]); } }}/>{query && <button className="clear-button" type="button" onClick={() => { setQuery(''); setSelected(null); searchInput.current?.focus(); }} aria-label={t.clear}><X size={16}/></button>}{selected && <Check className="selected-check" size={18}/>}</div>
            <button className="primary-button guess-submit" type="submit" disabled={!selected || busy || !isPlaying}>{busy ? t.busy : t.submit}<ArrowRight size={17}/></button>
            {showOptions && <ul className="song-options" id="song-options" role="listbox" aria-label={t.results}>{matches.length ? matches.map((song, i) => <li id={`song-option-${i}`} key={song.id} role="option" aria-selected={i === activeIndex} className={i === activeIndex ? 'option-active' : ''} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveIndex(i)} onClick={() => choose(song)}><Music2 size={17}/><div><strong>{song.title}</strong><small>{song.producer}</small></div><ArrowRight size={15}/></li>) : <li className="no-results">{t.noResults}</li>}</ul>}
            <p className="search-hint">{selected ? <><Check size={12}/>{t.selected} · {selected.producer}</> : t.searchHint}</p>
          </form>}

          {game && game.status !== 'playing' && game.answer && <div className={`answer-card ${game.status}`} aria-live="polite"><div className="answer-heading"><span className="answer-icon">{game.status === 'won' ? <Sparkles size={24}/> : <Headphones size={24}/>}</span><div><span className="section-kicker">{t.answer}</span><h2>{game.status === 'won' ? t.won : t.lost}</h2></div></div><h3>{game.answer.title}</h3><p>{game.answer.producers.map(artist => artist.name).join(' · ')} <span>feat.</span> {game.answer.vocalists.map(artist => artist.name).join(' · ')}</p><small>{game.status === 'won' ? t.wonMessage : t.lostMessage}</small><div className="answer-links">{game.answer.links.map(link => <a key={link.label} href={link.url} target="_blank" rel="noreferrer"><Volume2 size={13}/>{link.label}<ExternalLink size={11}/></a>)}<a href={game.answer.sourceUrl} target="_blank" rel="noreferrer">VocaDB<ExternalLink size={11}/></a></div><div className="answer-actions"><button className="primary-button" onClick={() => void newGame()} disabled={busy}>{t.newGame}<ArrowRight size={16}/></button><button className="secondary-button" onClick={() => void share()}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? t.copied : t.share}</button></div></div>}

          <div className="comparison-scroll" tabIndex={0} aria-label={t.legend}><table className="comparison-table"><thead><tr>{t.columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{game?.guesses.map((guess, index) => <tr key={guess.song.id} className="guess-row"><th scope="row"><span className="row-index">{String(index+1).padStart(2,'0')}</span><div><strong>{guess.song.title}</strong><small>{guess.song.producers.map(artist => artist.name).join(' · ')}</small></div></th>{attributes.map(attr => { const value = guess.feedback[attr]; const text = attr === 'vocalists' || attr === 'producers' ? guess.song[attr].map(artist => artist.name).join(' · ') || '—' : attr === 'year' ? guess.song.year ?? '—' : attr === 'bpm' ? bpm(guess.song) : duration(guess.song.lengthSeconds); return <td key={attr}><div className={`clue clue-${value}`} title={comparisonLabel(value)}><span>{text}</span><span className="clue-icon">{value === 'higher' ? <ArrowUp size={14}/> : value === 'lower' ? <ArrowDown size={14}/> : value === 'match' ? <Check size={13}/> : value === 'partial' ? '≈' : value === 'unknown' ? '?' : '×'}</span><span className="sr-only">{comparisonLabel(value)}</span></div></td>; })}</tr>)}</tbody></table></div>
          {!guessCount && <div className="empty-state"><div className="empty-notes" aria-hidden="true"><span>♪</span><Disc3 size={45} strokeWidth={1}/><span>♫</span></div><h3>{t.emptyTitle}</h3><p>{t.emptyDesc}</p><div className="empty-mini-grid" aria-hidden="true"><i/><i/><i/><i/><i/></div><span className="empty-note"><span className="tiny-dot"/>{!game && busy ? t.loading : t.emptyNote}</span></div>}

          <div className="game-bottom"><div className="legend"><span><i className="swatch match"/>{t.match}</span><span><i className="swatch partial"/>{t.partial}</span><span><i className="swatch different"/>{t.different}</span></div>{isPlaying && <button className="text-button" onClick={() => setModal('reveal')} disabled={busy}>{t.giveUp}<ArrowRight size={13}/></button>}</div><p className="arrow-hint">{t.arrowHint}</p>
        </section>
      </div>
      <footer className="site-footer"><div><span className="footer-logo"><AudioLines size={17}/> guessvocaloid.</span><p>{t.footer}</p></div><div className="footer-credits"><p>{t.credit} <a href="https://vocadb.net" target="_blank" rel="noreferrer">VocaDB ↗</a> · <a href="https://huggingface.co/datasets/amiadesu/VocaDBSongs" target="_blank" rel="noreferrer">amiadesu ↗</a></p><p><a href="https://wiki.vocadb.net/docs/license" target="_blank" rel="noreferrer">{t.license} · CC BY</a><span>{t.snapshot}</span></p></div></footer>
    </main>

    {modal === 'help' && <Modal title={t.helpTitle} close={() => setModal(null)}><p>{t.helpBody}</p><p>{t.helpMore}</p><div className="modal-legend">{(['match','partial','higher','lower','unknown'] as Comparison[]).map(value => <span className={`clue clue-${value}`} key={value}>{t[value]}</span>)}</div><button className="primary-button" onClick={() => setModal(null)}>{t.gotIt}<ArrowRight size={16}/></button></Modal>}
    {modal === 'catalog' && <Modal title={t.catalogTitle} wide close={() => setModal(null)}><p>{t.difficultyLabels[difficulty]} · Top {poolSongs.length} — {t.catalogDesc}</p><div className="catalog-search"><Search size={18}/><input value={catalogQuery} onChange={event => setCatalogQuery(event.target.value)} placeholder={t.catalogSearch} aria-label={t.catalogSearch}/></div><div className="catalog-list">{catalogMatches.map(song => <div key={song.id}><Music2 size={16}/><div><strong>{song.title}</strong><small>{song.producer}</small></div></div>)}{!catalogMatches.length && <p>{t.noResults}</p>}</div><small className="catalog-footnote">{catalogMatches.length} / {poolSongs.length} · {catalog?.source.importedAt} · {t.snapshot}</small></Modal>}
    {modal === 'difficulty' && pendingDifficulty && <Modal title={t.confirmDifficulty} close={() => setModal(null)}><p>{t.confirmDifficultyBody}</p><p>{t.difficultyLabels[pendingDifficulty]} · Top {DIFFICULTY_LIMITS[pendingDifficulty]}</p><div className="confirm-actions"><button className="secondary-button" onClick={() => setModal(null)}>{t.cancel}</button><button className="primary-button" onClick={() => void newGame(pendingDifficulty)}>{t.confirm}<ArrowRight size={16}/></button></div></Modal>}
    {(modal === 'new' || modal === 'reveal') && <Modal title={modal === 'new' ? t.confirmNew : t.confirmReveal} close={() => setModal(null)}><p>{modal === 'new' ? t.confirmNewBody : t.confirmRevealBody}</p><div className="confirm-actions"><button className="secondary-button" onClick={() => setModal(null)}>{t.cancel}</button><button className="primary-button" onClick={() => modal === 'new' ? void newGame() : void reveal()}>{t.confirm}<ArrowRight size={16}/></button></div></Modal>}
  </div>;
}
