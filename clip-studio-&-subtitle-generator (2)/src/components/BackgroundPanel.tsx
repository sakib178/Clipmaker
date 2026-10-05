import React, { useRef, useState, useEffect } from 'react';
import {
  AspectRatio,
  BackgroundConfig,
  BackgroundFit,
  CanvaAccountConfig,
  CanvaDesignItem,
} from '../types';
import { PRESET_BACKGROUNDS } from '../constants/presets';
import { safeFetchJson } from '../utils/api';
import {
  Upload,
  Video,
  Image,
  Ratio,
  Sparkles,
  Activity,
  Layers,
  ExternalLink,
  Palette,
  Download,
  CheckCircle2,
  Link2,
  UserCheck,
  KeyRound,
  Trash2,
  RefreshCw,
  LogOut,
  AppWindow,
} from 'lucide-react';

interface BackgroundPanelProps {
  background: BackgroundConfig;
  onBackgroundChange: (bg: BackgroundConfig) => void;
  canvaAccount: CanvaAccountConfig;
  onCanvaAccountChange: (acc: CanvaAccountConfig) => void;
  autoOpenCanvaConnect?: boolean;
  onClearAutoOpenCanvaConnect?: () => void;
}

export const BackgroundPanel: React.FC<BackgroundPanelProps> = ({
  background,
  onBackgroundChange,
  canvaAccount,
  onCanvaAccountChange,
  autoOpenCanvaConnect,
  onClearAutoOpenCanvaConnect,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvaFileInputRef = useRef<HTMLInputElement>(null);

  const [canvaCustomUrl, setCanvaCustomUrl] = useState(
    background.canvaDesignUrl || ''
  );
  const [canvaMediaImportUrl, setCanvaMediaImportUrl] = useState('');
  const [canvaImportStatus, setCanvaImportStatus] = useState<string | null>(null);

  // Canva Account Connect Modal/Drawer state
  const [showCanvaConnectForm, setShowCanvaConnectForm] = useState(false);
  const [connectEmail, setConnectEmail] = useState(canvaAccount.email || '');
  const [connectName, setConnectName] = useState(canvaAccount.accountName || '');
  const [connectWorkspace, setConnectWorkspace] = useState(
    canvaAccount.workspaceName || 'Canva Studio Workspace'
  );
  const [connectApiToken, setConnectApiToken] = useState('');
  const [isConnectingCanva, setIsConnectingCanva] = useState(false);

  useEffect(() => {
    if (autoOpenCanvaConnect) {
      setShowCanvaConnectForm(true);
      onClearAutoOpenCanvaConnect?.();
    }
  }, [autoOpenCanvaConnect, onClearAutoOpenCanvaConnect]);

  const updateBg = (key: keyof BackgroundConfig, value: any) => {
    onBackgroundChange({ ...background, [key]: value });
  };

  // Connect Canva Account via Backend API
  const handleConnectCanvaAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingCanva(true);
    try {
      const { ok, data } = await safeFetchJson('/api/canva/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: connectName.trim() || 'Canva Creator',
          email: connectEmail.trim() || 'creator@canva.com',
          workspaceName: connectWorkspace.trim() || 'Canva Studio Workspace',
          accessToken: connectApiToken.trim(),
          canvaDesignUrl: canvaCustomUrl.trim(),
          authMethod: connectApiToken.trim() ? 'api_token' : 'workspace_link',
        }),
      });
      if (!ok) throw new Error(data?.error || 'Canva connection failed.');
      if (ok && data?.canva) {
        onCanvaAccountChange(data.canva);
        setShowCanvaConnectForm(false);
        setCanvaImportStatus(
          `Connected to Canva account "${data.canva.accountName}" (${data.canva.workspaceName})!`
        );
      }
    } catch (err) {
      setCanvaImportStatus((err as Error).message || 'Canva connection failed.');
    } finally {
      setIsConnectingCanva(false);
    }
  };

  // Popup OAuth Authorize for Canva
  const handleCanvaPopupOAuth = async () => {
    try {
      const { ok, data } = await safeFetchJson(
        `/api/oauth/url?provider=canva&origin=${encodeURIComponent(window.location.origin)}`
      );
      if (!ok || !data?.url) throw new Error(data?.error || 'Canva OAuth is unavailable.');
      if (data?.url) {
        const width = 520;
        const height = 640;
        const left = Math.max(20, Math.round((window.screen.width - width) / 2));
        const top = Math.max(20, Math.round((window.screen.height - height) / 2));
        window.open(
          data.url,
          'CanvaOAuthPopup',
          `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );
      }
    } catch (err) {
      setCanvaImportStatus((err as Error).message || 'Canva OAuth failed.');
    }
  };

  // Disconnect Canva Account
  const handleDisconnectCanva = async () => {
    try {
      const { ok, data } = await safeFetchJson('/api/canva/disconnect', { method: 'POST' });
      if (ok && data?.canva) {
        onCanvaAccountChange(data.canva);
        setCanvaImportStatus('Disconnected Canva account.');
      }
    } catch (err) {
      console.error('Disconnect Canva error:', err);
    }
  };

  // Open Separate Window Live Background Editor Bridge
  const handleOpenSeparateStudioWindow = () => {
    const url = `${window.location.origin}/canva-studio-window?aspectRatio=${encodeURIComponent(
      background.aspectRatio
    )}`;
    const width = 1100;
    const height = 780;
    const left = Math.max(20, Math.round((window.screen.width - width) / 2));
    const top = Math.max(20, Math.round((window.screen.height - height) / 2));
    window.open(
      url,
      'CanvaBackgroundStudioWindow',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    setCanvaImportStatus(
      'Opened Separate Background Editor Window! Click "Apply Background" there to update the player.'
    );
  };

  // Upload handler for video or image
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    fromCanva: boolean = false
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');
    if (!isVideo && !isImage) { setCanvaImportStatus('Choose a supported image or video background.'); return; }
    const objectUrl = URL.createObjectURL(file);

    onBackgroundChange({
      ...background,
      type: isVideo ? 'video' : isImage ? 'image' : 'video',
      src: objectUrl,
      name: fromCanva ? `Canva: ${file.name}` : file.name,
    });

    if (fromCanva) {
      setCanvaImportStatus(`Imported "${file.name}" from Canva as active background!`);
    }
  };

  // Apply direct media URL exported from Canva or external host
  const handleApplyCanvaMediaUrl = () => {
    const trimmed = canvaMediaImportUrl.trim();
    if (!trimmed) return;
    const isVideo = /\.(mp4|webm|mov)(\?.*)?$/i.test(trimmed);
    onBackgroundChange({
      ...background,
      type: isVideo ? 'video' : 'image',
      src: trimmed,
      name: 'Canva Custom Background',
      canvaDesignUrl: canvaCustomUrl || trimmed,
    });
    setCanvaImportStatus('Applied Canva background media to canvas!');
    setCanvaMediaImportUrl('');
  };

  // Apply a design from connected Canva workspace
  const handleApplyCanvaDesign = async (dsn: CanvaDesignItem) => {
    if (dsn.exportable) {
      setCanvaImportStatus(`Exporting "${dsn.title}" from Canva...`);
      try {
        const response = await fetch('/api/canva/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ designId: dsn.id, format: dsn.mediaType === 'video' ? 'mp4' : 'png' }) });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Canva export failed.'); }
        const src = URL.createObjectURL(await response.blob());
        onBackgroundChange({ ...background, type: dsn.mediaType === 'video' ? 'video' : 'image', src, name: dsn.title, canvaDesignUrl: dsn.canvaEditUrl });
        setCanvaImportStatus(`Applied "${dsn.title}" from Canva.`);
      } catch (error: any) { setCanvaImportStatus(error.message || 'Canva export failed.'); }
      return;
    }
    onBackgroundChange({
      ...background,
      type: dsn.mediaType,
      src: dsn.mediaUrl,
      name: dsn.title,
      canvaDesignUrl: dsn.canvaEditUrl || background.canvaDesignUrl,
    });
    setCanvaImportStatus(`Applied "${dsn.title}" from Canva library!`);
  };

  // Map active aspect ratio to Canva studio launch URL and dimensions
  const getCanvaStudioConfig = (ratio: AspectRatio) => {
    switch (ratio) {
      case '9:16':
        return {
          url: 'https://www.canva.com/create/instagram-reels/',
          dims: '1080 × 1920 px (9:16 Vertical Reel)',
        };
      case '16:9':
        return {
          url: 'https://www.canva.com/create/youtube-videos/',
          dims: '1920 × 1080 px (16:9 Landscape Video)',
        };
      case '1:1':
        return {
          url: 'https://www.canva.com/create/instagram-posts/',
          dims: '1080 × 1080 px (1:1 Square Post)',
        };
      case '4:5':
        return {
          url: 'https://www.canva.com/create/videos/',
          dims: '1080 × 1350 px (4:5 Portrait Feed)',
        };
    }
  };

  const canvaStudio = getCanvaStudioConfig(background.aspectRatio);
  const effectiveCanvaHref =
    canvaCustomUrl.trim() && /^https?:\/\//i.test(canvaCustomUrl.trim())
      ? canvaCustomUrl.trim()
      : canvaStudio.url;

  const handlePasteCanvaClipboard = async () => {
    try {
      if (!navigator.clipboard?.read) {
        setCanvaImportStatus('Use "Import Canva Export" to select your downloaded Canva file.');
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          const url = URL.createObjectURL(blob);
          onBackgroundChange({
            ...background,
            type: 'image',
            src: url,
            name: 'Canva Clipboard Design',
          });
          setCanvaImportStatus('Pasted edited background directly from Canva clipboard!');
          return;
        }
      }
      setCanvaImportStatus('No image found in clipboard. Export from Canva or copy an image first.');
    } catch {
      setCanvaImportStatus('Use "Import Canva Export" button to load your saved Canva background.');
    }
  };

  const aspectRatios: { ratio: AspectRatio; label: string; desc: string }[] = [
    { ratio: '9:16', label: '9:16', desc: 'Shorts / Reels / TikTok' },
    { ratio: '16:9', label: '16:9', desc: 'YouTube Landscape' },
    { ratio: '1:1', label: '1:1', desc: 'Square Feed' },
    { ratio: '4:5', label: '4:5', desc: 'Portrait Post' },
  ];

  return (
    <div className="flex flex-col gap-5 p-4 border rounded-2xl bg-zinc-900 border-zinc-800 shadow-xl lg:overflow-y-auto lg:max-h-[640px]">
      {/* Aspect Ratio Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
            <Ratio className="w-3.5 h-3.5 text-indigo-400" />
            <span>Aspect Ratio (Clip Format)</span>
          </div>
          {background.type !== 'none' && Boolean(background.src || background.youtubeVideoId) && (
            <button
              type="button"
              onClick={() =>
                onBackgroundChange({
                  ...background,
                  type: 'none',
                  src: '',
                  name: '',
                  youtubeVideoId: undefined,
                })
              }
              className="px-2 py-1 text-[10px] font-semibold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Remove Background
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {aspectRatios.map((item) => (
            <button
              key={item.ratio}
              onClick={() => updateBg('aspectRatio', item.ratio)}
              className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                background.aspectRatio === item.ratio
                  ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-sm'
                  : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
              }`}
            >
              <div className="text-xs font-bold">{item.label}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{item.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ==================== CANVA ACCOUNT & SEPARATE WINDOW STUDIO ==================== */}
      <div className="p-3.5 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/25 via-zinc-950 to-indigo-950/25 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-violet-500 flex items-center justify-center text-white font-black text-xs shadow-md shrink-0">
              C
            </div>
            <div>
              <h3 className="text-xs font-bold text-white flex flex-wrap items-center gap-1.5">
                Canva Background Studio
                {canvaAccount.connected ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Connected ({canvaAccount.accountName})
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Account Not Linked
                  </span>
                )}
              </h3>
              <p className="text-[10px] text-zinc-400">
                Preset: <span className="text-cyan-300 font-mono">{canvaStudio.dims}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {canvaAccount.connected ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowCanvaConnectForm((prev) => !prev)}
                  className="px-2 py-1 text-[10px] font-semibold text-cyan-200 bg-zinc-900 hover:bg-zinc-800 border border-cyan-500/30 rounded-lg cursor-pointer"
                >
                  Account Settings
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectCanva}
                  className="p-1 text-zinc-400 hover:text-red-400 bg-zinc-900 border border-zinc-800 rounded-lg cursor-pointer"
                  title="Disconnect Canva Account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowCanvaConnectForm((prev) => !prev)}
                className="px-2.5 py-1.5 text-[11px] font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg flex items-center gap-1 cursor-pointer shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5" />
                Connect Canva Account
              </button>
            )}
          </div>
        </div>

        {/* Canva Account Connection Drawer */}
        {showCanvaConnectForm && (
          <form
            onSubmit={handleConnectCanvaAccount}
            className="p-3 rounded-xl bg-zinc-950/95 border border-cyan-500/40 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                Link Your Canva Account &amp; Workspace
              </span>
              <button
                type="button"
                onClick={handleCanvaPopupOAuth}
                className="px-2 py-1 text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md flex items-center gap-1 cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                OAuth Popup Login
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">
                  Canva Account Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Studio"
                  value={connectName}
                  onChange={(e) => setConnectName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">
                  Canva Account Email
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={connectEmail}
                  onChange={(e) => setConnectEmail(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">
                  Canva Team / Workspace
                </label>
                <input
                  type="text"
                  placeholder="Personal / Brand Team"
                  value={connectWorkspace}
                  onChange={(e) => setConnectWorkspace(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-400 mb-0.5">
                  Canva Access Token (or use OAuth)
                </label>
                <input
                  type="password"
                  placeholder="CNV-... (for REST v1 design sync)"
                  value={connectApiToken}
                  onChange={(e) => setConnectApiToken(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCanvaConnectForm(false)}
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isConnectingCanva}
                className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isConnectingCanva ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Save &amp; Connect Canva Account</span>
              </button>
            </div>
          </form>
        )}

        {/* Custom Canva Design Share URL */}
        <div>
          <label className="block mb-1 text-[11px] text-zinc-400">
            Canva Design Link (optional — paste your Canva share/edit link or leave blank):
          </label>
          <input
            type="text"
            placeholder="https://www.canva.com/design/..."
            value={canvaCustomUrl}
            onChange={(e) => {
              setCanvaCustomUrl(e.target.value);
              updateBg('canvaDesignUrl', e.target.value);
            }}
            className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Separate Window Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* 1. Open Separate Window Studio Bridge (syncs directly back to player) */}
          <button
            type="button"
            onClick={handleOpenSeparateStudioWindow}
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <AppWindow className="w-3.5 h-3.5" />
            <span>BG Editor (Separate Window)</span>
          </button>

          {/* 2. Open Canva.com Directly in New Tab/Window (never blocked by e.preventDefault) */}
          <a
            href={effectiveCanvaHref}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 rounded-xl font-bold text-xs text-cyan-200 bg-zinc-900 hover:bg-zinc-800 border border-cyan-500/40 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <Palette className="w-3.5 h-3.5 text-cyan-400" />
            <span>Launch Canva.com ({background.aspectRatio})</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>

        {/* Synced Canva Workspace Designs */}
        {canvaAccount.connected && canvaAccount.designs && canvaAccount.designs.length > 0 && (
          <div className="pt-2 border-t border-zinc-800/80">
            <div className="flex items-center justify-between mb-1.5 text-[11px]">
              <span className="font-bold text-cyan-300">
                Connected Canva Workspace Designs ({canvaAccount.workspaceName})
              </span>
              <span className="text-[10px] text-zinc-500">Click to apply</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
              {canvaAccount.designs.map((dsn) => (
                <button
                  key={dsn.id}
                  type="button"
                  onClick={() => handleApplyCanvaDesign(dsn)}
                  className="p-2 rounded-lg border border-zinc-800 hover:border-cyan-500/60 bg-zinc-950/90 text-left flex items-center gap-2 transition-all cursor-pointer group"
                >
                  <div
                    className="w-7 h-7 rounded border border-zinc-700 shrink-0"
                    style={{
                      background: dsn.previewUrl.startsWith('linear-gradient')
                        ? dsn.previewUrl
                        : '#18181b',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-white truncate group-hover:text-cyan-300">
                      {dsn.title}
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono">{dsn.aspectRatio}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Import Exported Canva File or URL */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={() => canvaFileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg font-semibold text-[11px] text-cyan-200 bg-zinc-900 hover:bg-zinc-800 border border-cyan-500/30 flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Import File</span>
          </button>
          <input
            ref={canvaFileInputRef}
            type="file"
            accept="video/*,image/*"
            onChange={(e) => handleFileUpload(e, true)}
            className="hidden"
          />

          <div className="flex items-center gap-1.5 flex-1 min-w-[140px] px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg">
            <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              placeholder="Paste Canva image/video URL..."
              value={canvaMediaImportUrl}
              onChange={(e) => setCanvaMediaImportUrl(e.target.value)}
              className="w-full text-[11px] text-white bg-transparent focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyCanvaMediaUrl}
            disabled={!canvaMediaImportUrl.trim()}
            className="px-2.5 py-1.5 text-[11px] font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-lg disabled:opacity-40 cursor-pointer"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handlePasteCanvaClipboard}
            className="px-2 py-1.5 text-[11px] font-semibold text-cyan-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg cursor-pointer"
            title="Paste copied image from Canva clipboard"
          >
            Paste
          </button>
        </div>

        {canvaImportStatus && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{canvaImportStatus}</span>
          </div>
        )}
      </div>

      {/* Upload Background (Video or Image) */}
      <div className="pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-2 text-xs font-bold text-zinc-300">
          <span className="flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            Upload Local Video or Still Image
          </span>
          <span className="text-[10px] font-normal text-zinc-400">MP4, MOV, WebM, PNG, JPG</span>
        </div>

        {/* Upload Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex flex-col items-center justify-center p-5 text-center border-2 border-dashed rounded-xl border-zinc-700 hover:border-indigo-500/80 bg-zinc-950/40 hover:bg-zinc-950/80 transition-all cursor-pointer group"
        >
          <div className="p-3 mb-2 rounded-full bg-zinc-900 group-hover:bg-indigo-600/20 text-zinc-400 group-hover:text-indigo-400 transition-colors">
            <Upload className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-zinc-200">
            Click or drag &amp; drop your background
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Supports high-FPS videos or high-resolution stills
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            onChange={(e) => handleFileUpload(e, false)}
            className="hidden"
          />
        </div>

        {/* Current Active Background info */}
        {background.type !== 'none' && background.name && (
          <div className="flex items-center justify-between p-2 mt-2 border rounded-lg bg-zinc-950/80 border-zinc-800 text-xs">
            <div className="flex items-center gap-2 truncate">
              {background.type === 'video' ||
              background.type === 'preset-video' ||
              background.type === 'youtube-video' ? (
                <Video className="w-4 h-4 text-indigo-400 shrink-0" />
              ) : (
                <Image className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span className="truncate text-zinc-300">{background.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {background.src && background.type !== 'gradient' && (
                <a
                  href={background.src}
                  download={`background-${background.aspectRatio.replace(':', 'x')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-cyan-400 hover:text-cyan-300"
                  title="Download current background"
                >
                  <Download className="w-3.5 h-3.5" />
                </a>
              )}
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 uppercase font-mono">
                {background.type}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Preset Background Library */}
      <div className="pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-300">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>Optional Preset Backgrounds</span>
          </div>
          <button
            type="button"
            onClick={() =>
              onBackgroundChange({
                ...background,
                type: 'none',
                src: '',
                name: '',
                youtubeVideoId: undefined,
              })
            }
            className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
              background.type === 'none' || !background.src
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
            }`}
          >
            None (Blank Player)
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESET_BACKGROUNDS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => {
                onBackgroundChange({
                  ...background,
                  type: preset.type,
                  src: preset.videoUrl || preset.gradient || preset.previewUrl,
                  name: preset.name,
                });
              }}
              className={`relative overflow-hidden rounded-xl border group text-left aspect-video transition-all cursor-pointer ${
                background.name === preset.name && background.type !== 'none'
                  ? 'border-indigo-500 ring-1 ring-indigo-500'
                  : 'border-zinc-800 hover:border-indigo-500'
              }`}
            >
              <img
                src={preset.previewUrl}
                alt={preset.name}
                referrerPolicy="no-referrer"
                className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-2">
                <span className="text-[11px] font-semibold text-white truncate">
                  {preset.name}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Video Fit & Extra Options (Defaulted to 0 / Off) */}
      <div className="pt-3 border-t border-zinc-800">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-zinc-300">
          <Layers className="w-3.5 h-3.5 text-indigo-400" />
          <span>Background Fit &amp; Extra Options</span>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          {(
            [
              { id: 'cover', label: 'Cover (Fill)' },
              { id: 'contain', label: 'Contain (Fit)' },
              { id: 'blur-mirror', label: 'Blur Mirror' },
            ] as { id: BackgroundFit; label: string }[]
          ).map((mode) => (
            <button
              key={mode.id}
              onClick={() => updateBg('fit', mode.id)}
              className={`py-1.5 px-2 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                background.fit === mode.id
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-zinc-950/60 text-zinc-300 border-zinc-800 hover:bg-zinc-800'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Darken Overlay (Default 0%) */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1">
              <span>Darken Overlay</span>
              <span className="font-mono text-white">
                {Math.round(background.darkenOverlay * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="0.85"
              step="0.05"
              value={background.darkenOverlay}
              onChange={(e) => updateBg('darkenOverlay', parseFloat(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Zoom & Blur */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Scale / Zoom</span>
                <span className="font-mono text-white">{background.scale.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.1"
                value={background.scale}
                onChange={(e) => updateBg('scale', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Blur Filter</span>
                <span className="font-mono text-white">{background.blur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={background.blur}
                onChange={(e) => updateBg('blur', parseInt(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Audio Visualizer Overlay Toggle (Default Off) */}
      <div className="pt-3 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-2 text-xs font-bold text-zinc-300">
          <span className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            Audio Waveform Visualizer Overlay
          </span>
          <input
            type="checkbox"
            checked={background.showVisualizer && background.visualizerStyle !== 'off'}
            onChange={(e) => {
              const checked = e.target.checked;
              onBackgroundChange({
                ...background,
                showVisualizer: checked,
                visualizerStyle: checked
                  ? background.visualizerStyle === 'off'
                    ? 'bars'
                    : background.visualizerStyle
                  : 'off',
              });
            }}
            className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
          />
        </div>

        {background.showVisualizer && background.visualizerStyle !== 'off' && (
          <div className="p-3 border rounded-xl bg-zinc-950/60 border-zinc-800 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(['bars', 'wave', 'circle'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => updateBg('visualizerStyle', style)}
                  className={`py-1 text-xs font-medium rounded border cursor-pointer ${
                    background.visualizerStyle === style
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {style === 'bars'
                    ? 'Dynamic Bars'
                    : style === 'wave'
                    ? 'Wave Curve'
                    : 'Radial Pulse'}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
              <span className="text-zinc-400">Visualizer Color</span>
              <input
                type="color"
                value={background.visualizerColor}
                onChange={(e) => updateBg('visualizerColor', e.target.value)}
                className="w-6 h-6 rounded border-none cursor-pointer bg-transparent"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
