import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CREW_HUE_STEP,
  CREW_LOOK_COUNT,
  CREW_POLL_INTERVAL_MS,
  CREW_PREVIEW_ZOOM,
} from '../constants.js';
import {
  crewApi,
  crewApiAvailable,
  type CrewView,
  type Worker,
  type WorkerPermissions,
  type WorkerTask,
} from '../crew/crewApi.js';
import { getCachedSprite } from '../office/sprites/spriteCache.js';
import { getCharacterSprites, getLoadedCharacterCount } from '../office/sprites/spriteData.js';
import { Direction } from '../office/types.js';
import { Button } from './ui/Button.js';
import { Checkbox } from './ui/Checkbox.js';
import { Modal } from './ui/Modal.js';

interface CrewPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'team' | 'tasks' | 'settings';

const inputClass =
  'w-full min-w-0 text-xs py-4 px-6 bg-bg-dark border-2 border-border rounded-none text-text';

const PERMISSION_LABELS: Array<{ key: keyof WorkerPermissions; label: string; hint: string }> = [
  {
    key: 'readWeb',
    label: 'Web sayfalarını okuyabilir',
    hint: 'Verdiğiniz ya da bulduğu bağlantıları açıp okur.',
  },
  {
    key: 'files',
    label: 'Ofis klasöründe dosya okuyup yazabilir',
    hint: 'Yalnızca ortak ofis klasörüne erişir, başka hiçbir yere değil.',
  },
  {
    key: 'delegate',
    label: 'Diğer worker’lara iş devredebilir',
    hint: 'Görevin parçalarını ekip arkadaşlarına verip sonuçlarını toplar.',
  },
];

const STATUS_LABEL: Record<WorkerTask['status'], string> = {
  running: 'Çalışıyor…',
  done: 'Tamamlandı',
  failed: 'Başarısız',
  stopped: 'Durduruldu',
};

const STATUS_CLASS: Record<WorkerTask['status'], string> = {
  running: 'text-status-active',
  done: 'text-status-success',
  failed: 'text-status-error',
  stopped: 'text-text-muted',
};

function blankWorker(): Omit<Worker, 'id'> {
  return {
    name: '',
    role: '',
    goal: '',
    backstory: '',
    palette: 0,
    hueShift: 0,
    permissions: { readWeb: true, files: true, delegate: false },
  };
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The worker's actual office character, standing and facing the viewer. */
function CharacterPreview({ palette, hueShift }: { palette: number; hueShift: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || getLoadedCharacterCount() === 0) return;
    const sprite = getCharacterSprites(palette, hueShift).walk[Direction.DOWN][1];
    const cached = getCachedSprite(sprite, CREW_PREVIEW_ZOOM);
    canvas.width = cached.width;
    canvas.height = cached.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cached, 0, 0);
  }, [palette, hueShift]);
  return <canvas ref={canvasRef} className="block" style={{ imageRendering: 'pixelated' }} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2 text-xs text-text-muted">
      {label}
      {children}
    </label>
  );
}

function TaskCard({
  task,
  workerName,
  onStop,
}: {
  task: WorkerTask;
  workerName?: string;
  onStop: (id: string) => void;
}) {
  const [open, setOpen] = useState(task.status !== 'running');
  const body = task.output ?? task.error;
  return (
    <div className="border-2 border-border p-6 flex flex-col gap-4">
      <div className="flex items-center gap-8 text-xs">
        <span className={STATUS_CLASS[task.status]}>{STATUS_LABEL[task.status]}</span>
        {workerName && <span className="text-accent-bright">{workerName}</span>}
        <span className="text-text-muted ml-auto">{formatTime(task.createdAt)}</span>
        {task.status === 'running' && (
          <Button size="sm" onClick={() => onStop(task.id)}>
            Durdur
          </Button>
        )}
      </div>
      <div className="text-sm whitespace-pre-wrap break-words">{task.description}</div>
      {body && (
        <>
          <button
            className="self-start text-xs text-text-muted bg-transparent border-none p-0 cursor-pointer hover:text-text"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? '▾ Sonucu gizle' : '▸ Sonucu göster'}
          </button>
          {open && (
            <div
              className={`text-xs whitespace-pre-wrap break-words bg-bg-dark p-6 max-h-[320px] overflow-auto select-text ${task.error ? 'text-status-error' : ''}`}
            >
              {body}
            </div>
          )}
          {open && task.output && (
            <Button
              size="sm"
              className="self-start"
              onClick={() => void navigator.clipboard?.writeText(task.output ?? '')}
            >
              Sonucu kopyala
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function CrewPanel({ isOpen, onClose }: CrewPanelProps) {
  const [view, setView] = useState<CrewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('team');
  /** Selected worker id, or 'new' while creating one. */
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Omit<Worker, 'id'>>(blankWorker());
  const [taskText, setTaskText] = useState('');
  const [busy, setBusy] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({
    provider: 'anthropic',
    model: '',
    apiKey: '',
  });
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setView(await crewApi.load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Load on open, then keep task status fresh while the panel is visible.
  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    const timer = setInterval(() => void refresh(), CREW_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOpen, refresh]);

  // First open: no key yet -> settings; no workers -> start creating one.
  const initialized = useRef(false);
  useEffect(() => {
    if (!view || initialized.current) return;
    initialized.current = true;
    setSettingsDraft({ provider: view.settings.provider, model: view.settings.model, apiKey: '' });
    if (!view.settings.hasApiKey) setTab('settings');
    if (view.workers.length === 0) {
      setSelected('new');
      setDraft({ ...blankWorker(), name: 'Ayşe', role: 'Araştırmacı' });
    } else {
      setSelected(view.workers[0].id);
      setDraft(view.workers[0]);
    }
  }, [view]);

  const run = async (action: () => Promise<CrewView>, success?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await action();
      setView(next);
      setError(null);
      if (success) setNotice(success);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const selectWorker = (worker: Worker) => {
    setSelected(worker.id);
    setDraft(worker);
    setTaskText('');
    setNotice(null);
  };

  const startNewWorker = () => {
    const used = new Set(view?.workers.map((w) => w.palette));
    const palette = [...Array(CREW_LOOK_COUNT).keys()].find((p) => !used.has(p)) ?? 0;
    setSelected('new');
    setDraft({ ...blankWorker(), palette });
    setTaskText('');
    setNotice(null);
  };

  const saveWorker = async () => {
    if (!draft.name.trim()) {
      setError('Worker’a bir ad verin.');
      return;
    }
    if (selected === 'new') {
      const before = new Set(view?.workers.map((w) => w.id));
      const next = await run(() => crewApi.createWorker(draft), `${draft.name} ofise katıldı!`);
      const created = next?.workers.find((w) => !before.has(w.id));
      if (created) selectWorker(created);
    } else if (selected) {
      await run(() => crewApi.updateWorker(selected, draft), 'Kaydedildi.');
    }
  };

  const deleteWorker = async () => {
    if (!selected || selected === 'new') return;
    if (!window.confirm(`${draft.name} ekipten çıkarılsın mı?`)) return;
    const next = await run(() => crewApi.deleteWorker(selected));
    if (next?.workers[0]) selectWorker(next.workers[0]);
    else startNewWorker();
  };

  const assignTask = async () => {
    if (!selected || selected === 'new' || !taskText.trim()) return;
    const next = await run(
      () => crewApi.assignTask(selected, taskText),
      'Görev verildi. Worker masasına geçip çalışmaya başladı.',
    );
    if (next) setTaskText('');
  };

  const stopTask = (taskId: string) => void run(() => crewApi.stopTask(taskId));

  const saveSettings = async () => {
    const next = await run(
      () =>
        crewApi.saveSettings({
          provider: settingsDraft.provider,
          model: settingsDraft.model,
          apiKey: settingsDraft.apiKey || undefined,
        }),
      'Ayarlar kaydedildi.',
    );
    if (next) {
      setSettingsDraft({
        provider: next.settings.provider,
        model: next.settings.model,
        apiKey: '',
      });
      if (next.settings.hasApiKey) setTab('team');
    }
  };

  if (!isOpen) return null;

  const workerById = new Map(view?.workers.map((w) => [w.id, w]));
  const current = selected && selected !== 'new' ? workerById.get(selected) : undefined;
  const workerTasks = view?.tasks.filter((t) => t.workerId === selected) ?? [];
  const lookCount = Math.max(
    1,
    Math.min(CREW_LOOK_COUNT, getLoadedCharacterCount() || CREW_LOOK_COUNT),
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ekip"
      className="w-[min(1100px,96vw)] max-h-[92vh] flex flex-col"
    >
      {!crewApiAvailable() && (
        <div className="text-xs text-warning px-10 py-6">
          Bu sayfa erişim anahtarı olmadan açılmış. Ofisi, başlatma komutunun açtığı bağlantıdan
          açın.
        </div>
      )}

      <div className="flex gap-4 px-10 pb-6">
        {(
          [
            ['team', 'Ekibim'],
            ['tasks', 'Görevler'],
            ['settings', 'Ayarlar'],
          ] as Array<[Tab, string]>
        ).map(([id, label]) => (
          <Button
            key={id}
            size="md"
            variant={tab === id ? 'active' : 'default'}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
      </div>

      {view && !view.ready && (
        <div className="text-xs text-warning px-10 pb-6">{view.notReadyReason}</div>
      )}
      {view && view.ready && !view.settings.hasApiKey && tab !== 'settings' && (
        <div className="text-xs text-warning px-10 pb-6">
          Worker’ların çalışabilmesi için Ayarlar sekmesinden yapay zekâ API anahtarınızı girin.
        </div>
      )}
      {error && <div className="text-xs text-status-error px-10 pb-6">{error}</div>}
      {notice && <div className="text-xs text-status-success px-10 pb-6">{notice}</div>}

      <div className="overflow-auto px-10 pb-10 min-h-0">
        {tab === 'team' && (
          <div className="flex gap-12 items-start">
            {/* Worker list */}
            <div className="flex flex-col gap-4 w-[230px] shrink-0">
              {view?.workers.map((w) => (
                <button
                  key={w.id}
                  onClick={() => selectWorker(w)}
                  className={`flex items-center gap-6 p-4 border-2 rounded-none cursor-pointer text-left ${selected === w.id ? 'border-accent bg-active-bg' : 'border-border bg-btn-bg hover:bg-btn-hover'}`}
                >
                  <CharacterPreview palette={w.palette} hueShift={w.hueShift} />
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm truncate">{w.name}</span>
                    <span className="text-2xs text-text-muted truncate">{w.role}</span>
                    <span
                      className={`text-2xs ${w.busy ? 'text-status-active' : 'text-text-muted'}`}
                    >
                      {w.busy ? 'Çalışıyor' : 'Boşta'}
                    </span>
                  </span>
                </button>
              ))}
              <Button
                variant={selected === 'new' ? 'active' : 'accent'}
                size="md"
                onClick={startNewWorker}
              >
                + Yeni worker
              </Button>
            </div>

            {/* Worker editor */}
            {selected && (
              <div className="flex-1 min-w-0 flex flex-col gap-8">
                <div className="flex gap-12">
                  <div className="flex flex-col items-center gap-4 shrink-0">
                    <div className="bg-bg-dark border-2 border-border p-8">
                      <CharacterPreview palette={draft.palette} hueShift={draft.hueShift} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-6">
                    <Field label="Adı">
                      <input
                        className={inputClass}
                        value={draft.name}
                        placeholder="ör. Ayşe"
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Görevi / unvanı">
                      <input
                        className={inputClass}
                        value={draft.role}
                        placeholder="ör. Pazar Araştırmacısı, Metin Yazarı, Analist"
                        onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>

                <Field label="Görünüm">
                  <div className="flex flex-wrap gap-4">
                    {[...Array(lookCount).keys()].map((p) => (
                      <button
                        key={p}
                        onClick={() => setDraft({ ...draft, palette: p })}
                        className={`p-2 border-2 rounded-none cursor-pointer ${draft.palette === p ? 'border-accent bg-active-bg' : 'border-border bg-bg-dark hover:bg-btn-hover'}`}
                        title={`Görünüm ${p + 1}`}
                      >
                        <CharacterPreview palette={p} hueShift={draft.hueShift} />
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label={`Renk tonu (${draft.hueShift}°)`}>
                  <input
                    type="range"
                    min={0}
                    max={345}
                    step={CREW_HUE_STEP}
                    value={draft.hueShift}
                    onChange={(e) => setDraft({ ...draft, hueShift: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Hedefi (genel olarak neyi başarmaya çalışır?)">
                  <input
                    className={inputClass}
                    value={draft.goal}
                    placeholder="ör. Rakipler hakkında güvenilir ve güncel bilgi toplamak"
                    onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                  />
                </Field>
                <Field label="Kişiliği ve geçmişi (nasıl çalışır, nasıl yazar?)">
                  <textarea
                    className={`${inputClass} min-h-[70px] resize-y`}
                    value={draft.backstory}
                    placeholder="ör. 10 yıllık deneyimli, titiz ve kısa öz yazan bir araştırmacı. Kaynak göstermeyi sever."
                    onChange={(e) => setDraft({ ...draft, backstory: e.target.value })}
                  />
                </Field>

                <div className="flex flex-col">
                  <span className="text-xs text-text-muted">Yetkileri</span>
                  {PERMISSION_LABELS.map(({ key, label, hint }) => (
                    <div key={key}>
                      <Checkbox
                        label={label}
                        checked={draft.permissions[key]}
                        onChange={() =>
                          setDraft({
                            ...draft,
                            permissions: { ...draft.permissions, [key]: !draft.permissions[key] },
                          })
                        }
                        className="text-sm"
                      />
                      <div className="text-2xs text-text-muted px-10 -mt-4 pb-4">{hint}</div>
                    </div>
                  ))}
                  {view && draft.permissions.files && (
                    <div className="text-2xs text-text-muted px-10">
                      Ofis klasörü: <span className="select-text">{view.filesDir}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-6">
                  <Button
                    variant="accent"
                    size="md"
                    disabled={busy}
                    onClick={() => void saveWorker()}
                  >
                    {selected === 'new' ? 'Ofise ekle' : 'Kaydet'}
                  </Button>
                  {selected !== 'new' && (
                    <Button size="md" disabled={busy} onClick={() => void deleteWorker()}>
                      Ekipten çıkar
                    </Button>
                  )}
                </div>

                {current && (
                  <div className="flex flex-col gap-6 border-t-2 border-border pt-8">
                    <span className="text-sm text-accent-bright">{current.name}’e görev ver</span>
                    <textarea
                      className={`${inputClass} min-h-[90px] resize-y`}
                      value={taskText}
                      placeholder="ör. Türkiye’deki en popüler 5 kahve zincirini araştır, her biri için kısa bir özet çıkar ve kahve-raporu.md olarak kaydet."
                      onChange={(e) => setTaskText(e.target.value)}
                    />
                    <Button
                      variant="accent"
                      size="md"
                      className="self-start"
                      disabled={busy || current.busy || !taskText.trim()}
                      onClick={() => void assignTask()}
                    >
                      {current.busy ? 'Şu an çalışıyor…' : 'Görevi ver'}
                    </Button>
                    {workerTasks.map((t) => (
                      <TaskCard key={t.id} task={t} onStop={stopTask} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'tasks' && (
          <div className="flex flex-col gap-6">
            {view?.tasks.length === 0 && (
              <div className="text-sm text-text-muted">
                Henüz görev yok. Ekibim sekmesinden bir worker seçip görev verin.
              </div>
            )}
            {view?.tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                workerName={workerById.get(t.workerId)?.name ?? '(ayrılmış worker)'}
                onStop={stopTask}
              />
            ))}
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-8 max-w-[640px]">
            <div className="text-xs text-text-muted">
              Worker’lar düşünmek için bir yapay zekâ hizmeti kullanır. Anahtarınız yalnızca bu
              bilgisayarda saklanır.
            </div>
            <Field label="Yapay zekâ sağlayıcısı">
              <select
                className={inputClass}
                value={settingsDraft.provider}
                onChange={(e) =>
                  setSettingsDraft({ ...settingsDraft, provider: e.target.value, model: '' })
                }
              >
                <option value="anthropic">Claude (Anthropic) — önerilen</option>
                <option value="openai">OpenAI</option>
              </select>
            </Field>
            <Field
              label={
                settingsDraft.provider === 'anthropic'
                  ? 'API anahtarı (console.anthropic.com → API Keys)'
                  : 'API anahtarı (platform.openai.com → API keys)'
              }
            >
              <input
                type="password"
                autoComplete="off"
                className={inputClass}
                value={settingsDraft.apiKey}
                placeholder={
                  view?.settings.hasApiKey
                    ? 'Kayıtlı ✓ (değiştirmek için yenisini yapıştırın)'
                    : settingsDraft.provider === 'anthropic'
                      ? 'sk-ant-...'
                      : 'sk-...'
                }
                onChange={(e) => setSettingsDraft({ ...settingsDraft, apiKey: e.target.value })}
              />
            </Field>
            <Field label="Model (boş bırakırsanız önerilen kullanılır)">
              <input
                className={inputClass}
                value={settingsDraft.model}
                placeholder={settingsDraft.provider === 'anthropic' ? 'claude-opus-5-5' : 'gpt-4o'}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, model: e.target.value })}
              />
            </Field>
            <Button
              variant="accent"
              size="md"
              className="self-start"
              disabled={busy}
              onClick={() => void saveSettings()}
            >
              Kaydet
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
