import { useState, useEffect, useCallback } from 'react';
import AppNavbar from './components/Navbar';
import LaunchTile from './components/LaunchTile';
import Wizard from './components/Wizard';
import PostSetupOptions from './components/PostSetupOptions';
import QuickStart from './components/QuickStart';
import QuickLaunch from './components/QuickLaunch';
import JobSetup from './components/JobSetup';
import ConnectionList from './components/ConnectionList';
import ConnectionDetail from './components/ConnectionDetail';
import SettingsButton from './components/SettingsButton';
import CatalogPrompt from './components/CatalogPrompt';
import Footer from './components/Footer';
import { useApi, postApi } from './hooks/useApi';

export interface CAPIConfig {
  accessToken: string;
  pixelId: string;
  testEventCode: string | null;
  testCodeMode: 'none' | 'consistent' | 'column';
  testCodeColumn: string;
  secretScope?: string;
  secretKey?: string;
}

export interface ConnectionResource {
  type: 'job' | 'notebook';
  url: string;
  name: string;
  createdAt: string;
  testEventCode?: string;
}

export interface SavedConnection {
  id: string;
  pixelId: string;
  createdAt: string;
  hasTestCode: boolean;
  testEventCode: string | null;
  testCodeMode: 'none' | 'consistent' | 'column';
  testCodeColumn: string;
  secretScope?: string;
  secretKey?: string;
  resources?: ConnectionResource[];
}

interface MarketplaceData {
  installed: boolean;
  listing_name?: string;
  listing_id?: string;
  catalog_name?: string;
  message?: string;
}

interface MeData {
  user_name: string | null;
  workspace: string;
}

interface HealthData {
  status: string;
  app: string;
  version: string;
  is_databricks_app: boolean;
}

interface Profile {
  name: string;
  host: string;
  active: boolean;
}

interface ProfilesData {
  profiles: Profile[];
  active_profile: string;
}

type View = 'home' | 'wizard' | 'options' | 'quick-start' | 'quick-launch' | 'job-setup' | 'connection-detail';

const CONNECTIONS_KEY = 'meta-capi-connections';
const CATALOG_KEY = 'meta-capi-catalog';
const CATALOG_SKIPPED_KEY = 'meta-capi-catalog-skipped';

function loadConnections(): SavedConnection[] {
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConnections(connections: SavedConnection[]) {
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(connections));
}

function parseHash(): { view: View; connId: string | null } {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('connection/')) {
    return { view: 'connection-detail', connId: hash.replace('connection/', '') };
  }
  return { view: 'home', connId: null };
}

export default function App() {
  const initial = parseHash();
  const savedConns = loadConnections();
  const initialConn = initial.connId ? savedConns.find(c => c.id === initial.connId) ?? null : null;

  const [view, setView] = useState<View>(initialConn ? initial.view : 'home');
  const [config, setConfig] = useState<CAPIConfig | null>(null);
  const [connections, setConnections] = useState<SavedConnection[]>(savedConns);
  const [selectedConnection, setSelectedConnection] = useState<SavedConnection | null>(initialConn);
  const [cameFromConnection, setCameFromConnection] = useState(false);
  const [profileKey, setProfileKey] = useState(0);
  const [catalogOverride, setCatalogOverride] = useState<string | null>(
    localStorage.getItem(CATALOG_KEY)
  );
  const [catalogSkipped, setCatalogSkipped] = useState(
    localStorage.getItem(CATALOG_SKIPPED_KEY) === 'true'
  );

  const { data: me } = useApi<MeData>('/me');
  const { data: marketplace, loading: marketplaceLoading, refetch: refetchMarketplace } =
    useApi<MarketplaceData>('/marketplace-listing');
  const { data: health } = useApi<HealthData>('/health');
  const { data: profilesData, refetch: refetchProfiles } = useApi<ProfilesData>('/profiles');

  // Show the catalog prompt on first session when we can't detect the catalog
  const isFirstSession = savedConns.length === 0;
  const catalogDetected = marketplace?.installed && !!marketplace.catalog_name;
  const showCatalogPrompt =
    isFirstSession &&
    !marketplaceLoading &&
    marketplace !== null &&
    !catalogDetected &&
    !catalogOverride &&
    !catalogSkipped;

  const isDatabricksApp = health?.is_databricks_app ?? true;
  const profiles = profilesData?.profiles ?? [];

  const handleCatalogSubmit = (name: string) => {
    localStorage.setItem(CATALOG_KEY, name);
    setCatalogOverride(name);
  };

  const handleCatalogSkip = () => {
    localStorage.setItem(CATALOG_SKIPPED_KEY, 'true');
    setCatalogSkipped(true);
  };

  const handleCatalogProfileSwitch = async (profileName: string) => {
    await postApi('/profiles/switch', { profile: profileName });
    refetchProfiles();
    refetchMarketplace();
    setProfileKey(k => k + 1);
  };

  const onProfileChanged = useCallback(() => {
    setProfileKey(k => k + 1);
  }, []);

  // Sync hash to URL when view changes
  useEffect(() => {
    if (view === 'connection-detail' && selectedConnection) {
      window.history.replaceState(null, '', `#connection/${selectedConnection.id}`);
    } else if (view === 'home') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [view, selectedConnection]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const { view: newView, connId } = parseHash();
      if (newView === 'connection-detail' && connId) {
        const conn = connections.find(c => c.id === connId);
        if (conn) {
          setSelectedConnection(conn);
          setView('connection-detail');
          return;
        }
      }
      setView('home');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [connections]);

  useEffect(() => {
    saveConnections(connections);
  }, [connections]);

  const handleWizardComplete = (cfg: CAPIConfig) => {
    setConfig(cfg);

    const newConn: SavedConnection = {
      id: crypto.randomUUID(),
      pixelId: cfg.pixelId,
      createdAt: new Date().toISOString(),
      hasTestCode: !!cfg.testEventCode,
      testEventCode: cfg.testEventCode,
      testCodeMode: cfg.testCodeMode,
      testCodeColumn: cfg.testCodeColumn,
      secretScope: cfg.secretScope,
      secretKey: cfg.secretKey,
    };
    setConnections(prev => [newConn, ...prev]);
    setSelectedConnection(newConn);

    setView('options');
  };

  const handleDeleteConnection = (id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id));
  };

  const handleSelectConnection = (conn: SavedConnection) => {
    setSelectedConnection(conn);
    setView('connection-detail');
  };

  const handleUpdateConnection = (updated: SavedConnection) => {
    setConnections(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelectedConnection(updated);
  };

  const addResourceToConnection = (resource: ConnectionResource) => {
    const connId = selectedConnection?.id;
    if (!connId) return;
    setConnections(prev =>
      prev.map(c =>
        c.id === connId
          ? { ...c, resources: [...(c.resources ?? []), resource] }
          : c
      )
    );
    setSelectedConnection(prev =>
      prev ? { ...prev, resources: [...(prev.resources ?? []), resource] } : prev
    );
  };

  const configFromConnection = (conn: SavedConnection): CAPIConfig => ({
    accessToken: '', // token is stored in secrets, not in localStorage
    pixelId: conn.pixelId,
    testEventCode: conn.testEventCode,
    testCodeMode: conn.testCodeMode,
    testCodeColumn: conn.testCodeColumn,
    secretScope: conn.secretScope,
    secretKey: conn.secretKey,
  });

  const handleConnectionQuickStart = () => {
    if (selectedConnection) {
      setConfig(configFromConnection(selectedConnection));
      setCameFromConnection(true);
      setView('quick-start');
    }
  };

  const handleConnectionQuickLaunch = () => {
    if (selectedConnection) {
      setConfig(configFromConnection(selectedConnection));
      setCameFromConnection(true);
      setView('quick-launch');
    }
  };

  const handleConnectionJobSetup = () => {
    if (selectedConnection) {
      setConfig(configFromConnection(selectedConnection));
      setCameFromConnection(true);
      setView('job-setup');
    }
  };

  const backFromAction = () => {
    if (cameFromConnection) {
      setCameFromConnection(false);
      setView('connection-detail');
    } else {
      setView('options');
    }
  };

  return (
    <div className="d-flex flex-column min-vh-100">
      <AppNavbar profileKey={profileKey} onHome={() => setView('home')} />

      <main className="flex-grow-1 d-flex align-items-center justify-content-center py-4">
        {view === 'home' && (
          <div className="d-flex flex-column align-items-center" style={{ maxWidth: 480, width: '100%' }}>
            <LaunchTile onLaunch={() => setView('wizard')} />
            {connections.length > 0 && (
              <>
                <hr className="w-100 my-4" style={{ borderColor: 'var(--meta-border)' }} />
                <ConnectionList
                  connections={connections}
                  onDelete={handleDeleteConnection}
                  onSelect={handleSelectConnection}
                />
              </>
            )}
          </div>
        )}
        {view === 'wizard' && (
          <Wizard
            onClose={() => setView('home')}
            onComplete={handleWizardComplete}
          />
        )}
        {view === 'options' && (
          <PostSetupOptions
            onQuickStart={() => setView('quick-start')}
            onQuickLaunch={() => setView('quick-launch')}
            onJobSetup={() => setView('job-setup')}
            onBack={() => setView('home')}
          />
        )}
        {view === 'quick-start' && config && (
          <QuickStart
            config={config}
            catalogOverride={catalogOverride}
            onBack={backFromAction}
            onDone={() => setView('home')}
          />
        )}
        {view === 'quick-launch' && config && (
          <QuickLaunch
            profileKey={profileKey}
            config={config}
            onBack={backFromAction}
            onDone={() => setView('home')}
            onResourceCreated={selectedConnection ? addResourceToConnection : undefined}
          />
        )}
        {view === 'job-setup' && config && (
          <JobSetup
            config={config}
            catalogOverride={catalogOverride}
            onBack={backFromAction}
            onDone={() => setView('home')}
            onResourceCreated={selectedConnection ? addResourceToConnection : undefined}
          />
        )}
        {view === 'connection-detail' && selectedConnection && (
          <ConnectionDetail
            connection={selectedConnection}
            onBack={() => setView('home')}
            onUpdate={handleUpdateConnection}
            onQuickStart={handleConnectionQuickStart}
            onQuickLaunch={handleConnectionQuickLaunch}
            onJobSetup={handleConnectionJobSetup}
          />
        )}
      </main>

      <Footer />
      <SettingsButton
        onProfileChanged={onProfileChanged}
        catalogOverride={catalogOverride}
        onCatalogSave={handleCatalogSubmit}
      />

      {showCatalogPrompt && (
        <CatalogPrompt
          onSubmit={handleCatalogSubmit}
          onSkip={handleCatalogSkip}
          workspace={me?.workspace}
          profiles={isDatabricksApp ? undefined : profiles}
          activeProfile={profilesData?.active_profile}
          onProfileSwitch={isDatabricksApp ? undefined : handleCatalogProfileSwitch}
        />
      )}
    </div>
  );
}
