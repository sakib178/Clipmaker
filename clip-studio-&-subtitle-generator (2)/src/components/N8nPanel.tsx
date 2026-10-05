import React, { useState, useEffect } from 'react';
import {
  AspectRatio,
  N8nConfig,
  N8nExecutionLog,
  SocialAccountConnection,
  SocialPlatformId,
  SubtitleCue,
} from '../types';
import { downloadTextFile, formatTime } from '../utils/time';
import { safeFetchJson } from '../utils/api';
import {
  Workflow,
  CheckCircle2,
  Sparkles,
  Send,
  Calendar,
  Link2,
  Download,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  ShieldCheck,
  Share2,
  KeyRound,
  Activity,
  Copy,
  Check,
  X,
  Unplug,
  Play,
  History,
} from 'lucide-react';

interface N8nPanelProps {
  n8nConfig: N8nConfig;
  onN8nConfigChange: (config: N8nConfig) => void;
  subtitles: SubtitleCue[];
  clipTitleText?: string;
  clipDuration: number;
  aspectRatio: AspectRatio;
  audioName: string;
  exportId?: string;
}

export const N8nPanel: React.FC<N8nPanelProps> = ({
  n8nConfig,
  onN8nConfigChange,
  subtitles,
  clipTitleText = '',
  clipDuration,
  aspectRatio,
  audioName,
  exportId,
}) => {
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{
    ok: boolean;
    status: number;
    latencyMs?: number;
    targetUrl: string;
    responseText: string;
  } | null>(null);

  const [publishResult, setPublishResult] = useState<{
    executionId: string;
    webhookStatus: number;
    webhookResponseText: string;
    videoMp4Url?: string | null;
    results: { platform: string; name: string; handle: string; status: string; postUrl?: string }[];
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [executions, setExecutions] = useState<N8nExecutionLog[]>(
    n8nConfig.executions || []
  );

  // Social Account Connection Modal State
  const [connectingAccount, setConnectingAccount] =
    useState<SocialAccountConnection | null>(null);
  const [modalHandle, setModalHandle] = useState('');
  const [modalAuthMethod, setModalAuthMethod] = useState<
    'oauth' | 'api_token' | 'n8n_credential'
  >('oauth');
  const [modalCredentialName, setModalCredentialName] = useState('');
  const [modalApiToken, setModalApiToken] = useState('');
  const [isConnectingModal, setIsConnectingModal] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  const updateConfig = (partial: Partial<N8nConfig>) => {
    onN8nConfigChange({ ...n8nConfig, ...partial });
  };

  // Load persisted n8n config, connected social accounts, and execution logs from backend
  useEffect(() => {
    let mounted = true;
    safeFetchJson('/api/integrations', {}, 1)
      .then(({ data }) => {
        if (!mounted) return;
        const nextPartial: Partial<N8nConfig> = {};
        if (Array.isArray(data?.socialAccounts) && data.socialAccounts.length > 0) {
          nextPartial.accounts = data.socialAccounts;
        }
        if (data?.n8n) {
          if (data.n8n.webhookUrl && !n8nConfig.webhookUrl) {
            nextPartial.webhookUrl = data.n8n.webhookUrl;
          }
          if (data.n8n.authHeaderName && !n8nConfig.authHeaderName) {
            nextPartial.authHeaderName = data.n8n.authHeaderName;
          }
          if (Array.isArray(data.n8n.executions)) {
            setExecutions(data.n8n.executions);
            nextPartial.executions = data.n8n.executions;
          }
        }
        if (Object.keys(nextPartial).length > 0) {
          onN8nConfigChange({ ...n8nConfig, ...nextPartial });
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Listen for OAuth popup completion messages from `/api/oauth/:platform/start`
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'SOCIAL_OAUTH_SUCCESS' && Array.isArray(msg.accounts)) {
        updateConfig({ accounts: msg.accounts });
        setConnectingAccount(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [n8nConfig]);

  // Persist webhook configuration changes to backend
  const handleSaveWebhookConfig = async (
    webhookUrl: string,
    authHeaderName?: string,
    authHeaderValue?: string
  ) => {
    try {
      const { ok, data } = await safeFetchJson('/api/integrations/n8n/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
          authHeaderName,
          authHeaderValue,
        }),
      });
      if (!ok) throw new Error(data?.error || 'Could not save the webhook configuration.');
    } catch (error) {
      setPublishError((error as Error).message || 'Could not save the webhook configuration.');
    }
  };

  // Open Social Account Connection Modal
  const openAccountModal = (acc: SocialAccountConnection) => {
    setConnectingAccount(acc);
    setModalHandle(acc.handle || `@creator_${acc.id}`);
    setModalAuthMethod(acc.authMethod || 'n8n_credential');
    setModalCredentialName(
      acc.credentialName || `n8n_${acc.id}_oauth2_cred`
    );
    setModalApiToken('');
  };

  // Connect Social Account via OAuth Popup Window
  const handleLaunchSocialOAuth = (acc: SocialAccountConnection) => {
    const width = 540;
    const height = 680;
    const left = Math.max(20, Math.round((window.screen.width - width) / 2));
    const top = Math.max(20, Math.round((window.screen.height - height) / 2));
    const popup = window.open(
      `/api/oauth/${encodeURIComponent(acc.id)}/start?handle=${encodeURIComponent(
        modalHandle.trim() || acc.handle
      )}`,
      `OAuth_${acc.id}`,
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    if (popup) {
      popup.focus();
    }
  };

  // Connect Social Account via API Token or n8n Credential Mapping
  const handleSaveAccountConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectingAccount) return;
    setIsConnectingModal(true);
    try {
      const { ok, data } = await safeFetchJson('/api/integrations/social/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: connectingAccount.id,
          handle: modalHandle.trim() || connectingAccount.handle,
          authMethod: modalAuthMethod,
          credentialName: modalCredentialName.trim(),
          apiToken: modalApiToken.trim(),
        }),
      });
      if (!ok) throw new Error(data?.error || 'Account mapping failed.');
      if (ok && Array.isArray(data?.accounts)) {
        updateConfig({ accounts: data.accounts });
        setConnectingAccount(null);
      }
    } catch (err) {
      setPublishError((err as Error).message || 'Account mapping failed.');
    } finally {
      setIsConnectingModal(false);
    }
  };

  // Disconnect Social Account
  const handleDisconnectAccount = async (id: SocialPlatformId) => {
    try {
      const { ok, data } = await safeFetchJson('/api/integrations/social/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (ok && Array.isArray(data?.accounts)) {
        updateConfig({ accounts: data.accounts });
      }
    } catch {
      const updated = n8nConfig.accounts.map((acc) =>
        acc.id === id
          ? { ...acc, connected: false, enabledForPost: false }
          : acc
      );
      updateConfig({ accounts: updated });
    }
  };

  const toggleAccountPostTarget = (id: string) => {
    const updated = n8nConfig.accounts.map((acc) =>
      acc.id === id ? { ...acc, enabledForPost: !acc.enabledForPost } : acc
    );
    updateConfig({ accounts: updated });
  };

  // Test n8n Webhook Connection
  const handleTestWebhook = async () => {
    setIsTestingWebhook(true);
    setWebhookTestResult(null);
    setPublishError(null);
    try {
      await handleSaveWebhookConfig(
        n8nConfig.webhookUrl,
        n8nConfig.authHeaderName,
        n8nConfig.authHeaderValue
      );
      const { status, data } = await safeFetchJson('/api/n8n/test-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: n8nConfig.webhookUrl,
          authHeaderName: n8nConfig.authHeaderName,
          authHeaderValue: n8nConfig.authHeaderValue,
        }),
      });
      setWebhookTestResult({
        ok: Boolean(data?.ok),
        status: data?.status || status,
        latencyMs: data?.latencyMs,
        targetUrl: data?.targetUrl || n8nConfig.webhookUrl || '/api/n8n/webhook/clip-studio-autopost',
        responseText: data?.responseText || data?.error || 'Webhook test completed',
      });
    } catch (err: any) {
      setWebhookTestResult({
        ok: false,
        status: 500,
        targetUrl: n8nConfig.webhookUrl || '/api/n8n/webhook/clip-studio-autopost',
        responseText: err.message || 'Failed to reach webhook endpoint',
      });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  // Generate AI Caption & Hashtags via Gemini 3.8 Flash
  const handleGenerateCaption = async (lang: 'en' | 'ar') => {
    setIsGeneratingCaption(true);
    try {
      const { ok, data } = await safeFetchJson('/api/n8n/generate-caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtitles,
          clipTitle: clipTitleText || audioName,
          language: lang,
        }),
      });
      if (!ok) throw new Error(data?.error || 'Caption generation failed.');
      if (data?.warning) setPublishError(data.warning);
      if (ok && data?.caption) {
        updateConfig({
          caption: data.caption,
          hashtags: data.hashtags || n8nConfig.hashtags,
        });
      }
    } catch (e) {
      setPublishError((e as Error).message || 'Caption generation failed.');
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  // Trigger n8n Auto-Post Workflow
  const handleTriggerPublish = async () => {
    setIsPublishing(true);
    setPublishError(null);
    setPublishResult(null);

    try {
      if (!exportId) throw new Error('Export the current clip before sending it to n8n.');
      const { ok, data } = await safeFetchJson('/api/n8n/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...n8nConfig,
          scheduledTime: n8nConfig.scheduleMode === 'scheduled' && n8nConfig.scheduledTime ? new Date(n8nConfig.scheduledTime).toISOString() : '',
          clipMetadata: {
            exportId,
            title: clipTitleText || audioName,
            duration: clipDuration,
            aspectRatio,
            audioSourceName: audioName,
          },
          subtitles,
        }),
      });
      if (!ok || !data?.success) {
        throw new Error(data?.error || 'n8n workflow execution failed');
      }
      setPublishResult(data);
      if (Array.isArray(data?.executions)) {
        setExecutions(data.executions);
      }
    } catch (err: any) {
      setPublishError(err.message || 'Failed to trigger n8n workflow');
    } finally {
      setIsPublishing(false);
    }
  };

  // Build Ready-to-Import n8n Workflow Template (.json)
  const buildN8nTemplateObject = () => ({
    name: 'Clip Studio MP4 Webhook Starter',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'clip-studio-autopost',
          responseMode: 'onReceived',
        },
        name: 'Clip Studio Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 1,
        position: [220, 300],
      },
      {
        parameters: {
          url: '={{$json.body.clip.videoMp4Url}}',
          options: { response: { response: { responseFormat: 'file', outputPropertyName: 'videoFile' } } },
        },
        name: 'Download Rendered MP4 Clip',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 3,
        position: [450, 300],
      },
      {
        parameters: {
          fieldToSplitOut: 'body.targetAccounts',
          include: 'allOtherFields',
        },
        name: 'Split Connected Social Accounts',
        type: 'n8n-nodes-base.itemLists',
        typeVersion: 1,
        position: [680, 300],
      },

    ],
    connections: {
      'Clip Studio Webhook': {
        main: [[{ node: 'Split Connected Social Accounts', type: 'main', index: 0 }]],
      },
      'Split Connected Social Accounts': {
        main: [[{ node: 'Download Rendered MP4 Clip', type: 'main', index: 0 }]],
      },
    },
  });

  const handleDownloadN8nTemplate = () => {
    const template = buildN8nTemplateObject();
    downloadTextFile(
      'clip-studio-n8n-workflow.json',
      JSON.stringify(template, null, 2),
      'application/json'
    );
  };

  const handleCopyN8nTemplate = async () => {
    try {
      const template = buildN8nTemplateObject();
      await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
      setCopiedJson(true);
      setTimeout(() => setCopiedJson(false), 2000);
    } catch {}
  };

  const activeTargetsCount = n8nConfig.accounts.filter(
    (a) => a.connected && a.enabledForPost
  ).length;
  const connectedAccountsCount = n8nConfig.accounts.filter(
    (a) => a.connected
  ).length;

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-2xl bg-zinc-900 border-zinc-800 shadow-xl lg:overflow-y-auto lg:max-h-[640px]">
      {/* n8n Header Card */}
      <div className="p-3.5 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-950/25 via-zinc-950 to-rose-950/20 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 to-rose-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20 shrink-0">
            <Workflow className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
              <span>n8n Social Auto-Post Automation</span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Webhook Engine Ready
              </span>
            </h2>
            <p className="text-[10px] text-zinc-400">
              Send clips to your n8n publishing workflow. The JSON starter downloads the MP4; add your posting and scheduling nodes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyN8nTemplate}
            className="px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg flex items-center gap-1 cursor-pointer"
            title="Copy n8n Workflow JSON to paste directly onto your n8n canvas"
          >
            {copiedJson ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-orange-400" />
            )}
            {copiedJson ? 'Copied!' : 'Copy Workflow'}
          </button>
          <button
            type="button"
            onClick={handleDownloadN8nTemplate}
            className="px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg flex items-center gap-1 cursor-pointer"
            title="Download ready-to-import n8n Workflow JSON"
          >
            <Download className="w-3 h-3 text-orange-400" />
            .JSON
          </button>
          <a
            href="https://n8n.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-lg"
            title="Open n8n in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 1. Social Media Accounts Connection Matrix */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-orange-400" />
            Social Media Accounts ({connectedAccountsCount} connected &bull;{' '}
            {activeTargetsCount} active)
          </span>
          <span className="text-[10px] text-zinc-400">
            OAuth / n8n Credentials
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {n8nConfig.accounts.map((acc: SocialAccountConnection) => (
            <div
              key={acc.id}
              className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                acc.connected && acc.enabledForPost
                  ? 'bg-zinc-950/90 border-orange-500/50 shadow-sm'
                  : acc.connected
                  ? 'bg-zinc-950/70 border-zinc-700'
                  : 'bg-zinc-950/40 border-zinc-800/80 opacity-80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={acc.connected && acc.enabledForPost}
                  disabled={!acc.connected}
                  onChange={() => toggleAccountPostTarget(acc.id)}
                  className="w-4 h-4 accent-orange-500 rounded cursor-pointer shrink-0"
                  title={
                    acc.connected
                      ? 'Toggle auto-posting to this account'
                      : 'Connect account first to enable posting'
                  }
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <span>{acc.name}</span>
                    {acc.connected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </div>
                  <div
                    onClick={() => openAccountModal(acc)}
                    className="text-[10px] text-zinc-400 hover:text-orange-300 font-mono truncate cursor-pointer"
                    title="Click to configure account connection or handle"
                  >
                    {acc.connected
                      ? `${acc.handle} (${acc.authMethod || 'oauth'})`
                      : 'Not connected — click Connect'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {acc.connected ? (
                  <>
                    <button
                      type="button"
                      onClick={() => openAccountModal(acc)}
                      className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer"
                      title="Edit account handle or credential mapping"
                    >
                      Connected
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnectAccount(acc.id)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-800/50 cursor-pointer"
                      title="Disconnect account"
                    >
                      <Unplug className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openAccountModal(acc)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer"
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Social Account Connection Modal */}
      {connectingAccount && (
        <div className="p-3.5 rounded-2xl border border-orange-500/40 bg-zinc-950 space-y-3 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-orange-400" />
              <h3 className="text-xs font-bold text-white">
                Connect {connectingAccount.name} Account
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setConnectingAccount(null)}
              className="p-1 text-zinc-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Method 1: OAuth Popup Window */}
          <div className="p-2.5 rounded-xl bg-orange-950/20 border border-orange-500/30 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold text-orange-200">
                OAuth Credentials in n8n
              </div>
              <div className="text-[10px] text-zinc-400">
                Authenticate {connectingAccount.name} in n8n, then map its credential below
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleLaunchSocialOAuth(connectingAccount)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-gradient-to-r from-orange-500 to-rose-500 hover:from-orange-400 hover:to-rose-400 text-white shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Setup Instructions
            </button>
          </div>

          {/* Method 2: n8n Credential / API Token Configuration */}
          <form onSubmit={handleSaveAccountConnection} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  Account Handle / Channel
                </label>
                <input
                  type="text"
                  required
                  value={modalHandle}
                  onChange={(e) => setModalHandle(e.target.value)}
                  placeholder="@your_handle"
                  className="w-full px-2.5 py-1.5 text-xs font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  Connection Type
                </label>
                <select
                  value={modalAuthMethod}
                  onChange={(e) =>
                    setModalAuthMethod(
                      e.target.value as 'oauth' | 'api_token' | 'n8n_credential'
                    )
                  }
                  className="w-full px-2.5 py-1.5 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
                >
                  <option value="oauth">OAuth Account in n8n</option>
                  <option value="n8n_credential">n8n Credential Store Mapping</option>
                  <option value="api_token">Direct Platform API Token</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  n8n Credential Name (Sent in Webhook)
                </label>
                <input
                  type="text"
                  value={modalCredentialName}
                  onChange={(e) => setModalCredentialName(e.target.value)}
                  placeholder={`n8n_${connectingAccount.id}_cred`}
                  className="w-full px-2.5 py-1.5 text-xs font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-zinc-400 mb-1">
                  Platform Access Token (Optional)
                </label>
                <input
                  type="password"
                  value={modalApiToken}
                  onChange={(e) => setModalApiToken(e.target.value)}
                  placeholder="Bearer / API Token..."
                  className="w-full px-2.5 py-1.5 text-xs font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConnectingAccount(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isConnectingModal}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold text-white bg-orange-600 hover:bg-orange-500 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isConnectingModal ? 'Saving...' : 'Save & Connect Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. n8n Webhook Endpoint Configuration */}
      <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-orange-400" />
            n8n Webhook Trigger URL
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const builtInUrl = `${window.location.origin}/api/n8n/webhook/clip-studio-autopost`;
                updateConfig({ webhookUrl: builtInUrl });
                handleSaveWebhookConfig(
                  builtInUrl,
                  n8nConfig.authHeaderName,
                  n8nConfig.authHeaderValue
                );
              }}
              className="px-2 py-0.5 text-[10px] font-semibold text-orange-300 bg-orange-950/60 hover:bg-orange-900/60 border border-orange-500/30 rounded cursor-pointer"
              title="Test the payload with the local receiver. Use a real n8n webhook for publishing."
            >
              Use Test Receiver
            </button>
            <button
              type="button"
              onClick={handleTestWebhook}
              disabled={isTestingWebhook}
              className="px-2 py-0.5 text-[10px] font-bold text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 rounded flex items-center gap-1 cursor-pointer"
            >
              {isTestingWebhook ? (
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Play className="w-2.5 h-2.5" />
              )}
              Test Webhook
            </button>
          </div>
        </div>

        <input
          type="text"
          placeholder="https://your-instance.app.n8n.cloud/webhook/clip-studio-autopost"
          value={n8nConfig.webhookUrl}
          onChange={(e) => updateConfig({ webhookUrl: e.target.value })}
          onBlur={() =>
            handleSaveWebhookConfig(
              n8nConfig.webhookUrl,
              n8nConfig.authHeaderName,
              n8nConfig.authHeaderValue
            )
          }
          className="w-full px-2.5 py-1.5 text-xs font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="Auth Header (e.g. X-N8N-API-KEY)"
            value={n8nConfig.authHeaderName || ''}
            onChange={(e) => updateConfig({ authHeaderName: e.target.value })}
            onBlur={() =>
              handleSaveWebhookConfig(
                n8nConfig.webhookUrl,
                n8nConfig.authHeaderName,
                n8nConfig.authHeaderValue
              )
            }
            className="px-2.5 py-1.5 text-[11px] font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
          />
          <input
            type="password"
            placeholder="Header Secret Token (Optional)"
            value={n8nConfig.authHeaderValue || ''}
            onChange={(e) => updateConfig({ authHeaderValue: e.target.value })}
            onBlur={() =>
              handleSaveWebhookConfig(
                n8nConfig.webhookUrl,
                n8nConfig.authHeaderName,
                n8nConfig.authHeaderValue
              )
            }
            className="px-2.5 py-1.5 text-[11px] font-mono text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex items-center justify-between text-[10px] text-zinc-400 pt-0.5">
          <span className="flex items-center gap-1 text-emerald-400">
            <ShieldCheck className="w-3 h-3" /> Dispatches exported .MP4 URL + captions
          </span>
          <span className="font-mono truncate max-w-[210px]">
            GET /api/exports/&lt;export-id&gt;.mp4
          </span>
        </div>

        {/* Webhook Test Ping Result */}
        {webhookTestResult && (
          <div
            className={`p-2.5 rounded-xl border text-[11px] space-y-1 ${
              webhookTestResult.ok
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/30 border-red-500/40 text-red-300'
            }`}
          >
            <div className="flex items-center justify-between font-bold">
              <span className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                {webhookTestResult.ok
                  ? 'Webhook Ping Succeeded'
                  : 'Webhook Ping Failed'}
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/30">
                HTTP {webhookTestResult.status}{' '}
                {webhookTestResult.latencyMs
                  ? `• ${webhookTestResult.latencyMs}ms`
                  : ''}
              </span>
            </div>
            <div className="text-[10px] font-mono text-zinc-300 break-all">
              {webhookTestResult.responseText}
            </div>
          </div>
        )}
      </div>

      {/* 3. Post Caption & AI Hashtags (Powered by Gemini 3.8 Flash) */}
      <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-zinc-300">
            Post Caption &amp; Hashtags
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleGenerateCaption('en')}
              disabled={isGeneratingCaption}
              className="px-2 py-1 text-[10px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-md flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              {isGeneratingCaption ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI Caption (EN)
            </button>
            <button
              type="button"
              onClick={() => handleGenerateCaption('ar')}
              disabled={isGeneratingCaption}
              className="px-2 py-1 text-[10px] font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-md flex items-center gap-1 disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              وصف عربي (AR)
            </button>
          </div>
        </div>

        <textarea
          rows={2}
          value={n8nConfig.caption}
          onChange={(e) => updateConfig({ caption: e.target.value })}
          placeholder="Write your viral video caption..."
          className="w-full p-2 text-xs text-white bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500 resize-none"
        />

        <input
          type="text"
          value={n8nConfig.hashtags}
          onChange={(e) => updateConfig({ hashtags: e.target.value })}
          placeholder="#shorts #reels #tiktok #viral"
          className="w-full px-2.5 py-1.5 text-xs font-mono text-indigo-300 bg-zinc-900 border border-zinc-800 rounded-lg focus:outline-none focus:border-orange-500"
        />
      </div>

      {/* 4. Schedule Mode & Publish Trigger */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs">
          <span className="flex items-center gap-1.5 text-zinc-300 font-semibold">
            <Calendar className="w-3.5 h-3.5 text-orange-400" />
            Publishing Schedule:
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => updateConfig({ scheduleMode: 'immediate' })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                n8nConfig.scheduleMode === 'immediate'
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Post Immediately
            </button>
            <button
              type="button"
              onClick={() => updateConfig({ scheduleMode: 'scheduled' })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                n8nConfig.scheduleMode === 'scheduled'
                  ? 'bg-orange-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Schedule
            </button>
          </div>
        </div>

        {n8nConfig.scheduleMode === 'scheduled' && (
          <input
            type="datetime-local"
            value={n8nConfig.scheduledTime || ''}
            onChange={(e) => updateConfig({ scheduledTime: e.target.value })}
            className="w-full px-3 py-1.5 text-xs font-mono text-white bg-zinc-950 border border-zinc-800 rounded-xl focus:outline-none focus:border-orange-500"
          />
        )}

        <button
          type="button"
          onClick={handleTriggerPublish}
          disabled={isPublishing || activeTargetsCount === 0}
          className="w-full py-3 text-xs font-bold text-white bg-gradient-to-r from-orange-600 to-rose-600 hover:from-orange-500 hover:to-rose-500 active:scale-[0.99] rounded-xl shadow-lg shadow-orange-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
        >
          {isPublishing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Dispatching Clip to n8n Workflow...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>
                {activeTargetsCount === 0
                  ? 'Connect & Select at Least 1 Account Above'
                  : n8nConfig.scheduleMode === 'scheduled'
                  ? `Schedule Clip on ${activeTargetsCount} Social Account${
                      activeTargetsCount === 1 ? '' : 's'
                    } via n8n`
                  : `Auto-Post Clip (${formatTime(
                      clipDuration
                    )} MP4) to ${activeTargetsCount} Account${
                      activeTargetsCount === 1 ? '' : 's'
                    } via n8n`}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Latest Execution Result */}
      {publishResult && (
        <div className="p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/25 space-y-2 text-xs">
          <div className="flex items-center justify-between text-emerald-400 font-bold">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Request Accepted by n8n ({publishResult.executionId})
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20">
              HTTP {publishResult.webhookStatus}
            </span>
          </div>
          <p className="text-[11px] text-zinc-300 font-mono break-all">
            {publishResult.webhookResponseText}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
            {publishResult.results.map((r) => (
              <div
                key={r.platform}
                className="px-2.5 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 flex items-center justify-between text-[10px]"
              >
                <span className="text-zinc-200 font-semibold truncate">
                  {r.name} ({r.handle})
                </span>
                <span className="text-emerald-400 uppercase font-mono font-bold">
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {publishError && (
        <div className="p-2.5 rounded-xl border border-red-800/60 bg-red-950/40 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{publishError}</span>
        </div>
      )}

      {/* Recent n8n Workflow Executions Log */}
      {executions.length > 0 && (
        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/50 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-orange-400" />
              Recent n8n Executions ({executions.length})
            </span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {executions.slice(0, 5).map((ex) => (
              <div
                key={ex.executionId}
                className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-between gap-2 text-[10px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono font-semibold text-zinc-200 truncate">
                    {ex.executionId} &bull; {ex.clipTitle}
                  </div>
                  <div className="text-zinc-400 truncate">
                    {new Date(ex.timestamp).toLocaleTimeString()} &rarr;{' '}
                    {ex.results.map((r) => r.name).join(', ')}
                  </div>
                </div>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono shrink-0">
                  HTTP {ex.webhookStatus}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
