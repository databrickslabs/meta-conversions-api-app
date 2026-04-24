import { useState, useEffect } from 'react';
import Alert from 'react-bootstrap/Alert';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Offcanvas from 'react-bootstrap/Offcanvas';
import Form from 'react-bootstrap/Form';
import Spinner from 'react-bootstrap/Spinner';
import { useApi, postApi } from '../hooks/useApi';

interface AuthIssue {
  severity: 'warning' | 'error';
  code: string;
  detail: string;
}

interface MeData {
  user_name: string | null;
  workspace: string;
  auth_issue: AuthIssue | null;
}

interface HealthData {
  status: string;
  app: string;
  version: string;
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

interface MarketplaceData {
  installed: boolean;
  listing_name?: string;
  listing_id?: string;
  catalog_name?: string;
  message?: string;
}

const LISTING_ID = '8a8f4ead-db28-45e9-b39b-aabbbe1dbe08';

interface Props {
  onProfileChanged: () => void;
  catalogOverride: string | null;
  onCatalogSave: (name: string) => void;
}

export default function SettingsButton({ onProfileChanged, catalogOverride, onCatalogSave }: Props) {
  const [show, setShow] = useState(false);
  const { data: me, refetch: refetchMe } = useApi<MeData>('/me');
  const { data: health } = useApi<HealthData>('/health');
  const { data: profilesData, refetch: refetchProfiles } = useApi<ProfilesData>('/profiles');
  const { data: marketplace, refetch: refetchMarketplace } = useApi<MarketplaceData>('/marketplace-listing');
  const [switching, setSwitching] = useState(false);
  const [catalogInput, setCatalogInput] = useState(catalogOverride ?? '');
  const [catalogSaved, setCatalogSaved] = useState(false);

  // Sync catalogInput when catalogOverride changes (e.g. from catalog prompt)
  useEffect(() => {
    if (catalogOverride) setCatalogInput(catalogOverride);
  }, [catalogOverride]);

  const handleSwitchProfile = async (profileName: string) => {
    setSwitching(true);
    try {
      await postApi('/profiles/switch', { profile: profileName });
      refetchProfiles();
      refetchMe();
      refetchMarketplace();
      onProfileChanged();
    } catch {
      // ignore
    } finally {
      setSwitching(false);
    }
  };

  const profiles = profilesData?.profiles ?? [];
  const activeProfile = profilesData?.active_profile ?? 'DEFAULT';

  const sectionLabel = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#6c757d' };
  const rowStyle = { fontSize: 13, padding: '6px 0' };

  const marketplaceInstalled = marketplace?.installed && marketplace.catalog_name;

  return (
    <>
      <Button
        variant="outline-secondary"
        className="settings-btn"
        onClick={() => setShow(true)}
        title="Settings"
      >
        <i className="fa-solid fa-gear" />
      </Button>

      <Offcanvas show={show} onHide={() => setShow(false)} placement="start">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>Settings</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body>
          {me?.auth_issue && (
            <Alert
              variant={me.auth_issue.severity === 'error' ? 'danger' : 'warning'}
              className="py-2 small mb-3"
            >
              {me.auth_issue.detail}
            </Alert>
          )}

          {/* --- Environment --- */}
          <div style={sectionLabel} className="mb-2">Environment</div>
          <div style={rowStyle} className="d-flex justify-content-between">
            <span className="text-muted">User</span>
            <span className="fw-medium text-truncate ms-2" style={{ maxWidth: 200 }}>
              {me == null
                ? '…'
                : me.user_name ??
                  (me.auth_issue ? '—' : 'Not signed in')}
            </span>
          </div>
          <div style={rowStyle} className="d-flex justify-content-between">
            <span className="text-muted">Workspace</span>
            <span className="fw-medium text-truncate ms-2" style={{ maxWidth: 200 }}>
              {me?.workspace ?? '...'}
            </span>
          </div>
          <div style={rowStyle} className="d-flex justify-content-between">
            <span className="text-muted">App</span>
            <span>{health?.app ?? '...'}</span>
          </div>
          <div style={rowStyle} className="d-flex justify-content-between">
            <span className="text-muted">Version</span>
            <span>{health?.version ?? '...'}</span>
          </div>

          {/* --- Profile --- */}
          {profiles.length > 0 && (
            <>
              <hr className="my-3" style={{ borderColor: '#e9ecef' }} />
              <div style={sectionLabel} className="mb-2">
                Databricks Profile
              </div>
              <Form.Select
                size="sm"
                value={activeProfile}
                onChange={(e) => handleSwitchProfile(e.target.value)}
                disabled={switching}
                className="mb-1"
              >
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </Form.Select>
              {switching ? (
                <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                  <Spinner animation="border" size="sm" />
                  Switching...
                </div>
              ) : (
                <div style={{ fontSize: 11 }} className="text-muted">
                  {profiles.find(p => p.name.toUpperCase() === activeProfile.toUpperCase())?.host || ''}
                </div>
              )}
            </>
          )}

          <hr className="my-3" style={{ borderColor: '#e9ecef' }} />

          {/* --- Marketplace --- */}
          {marketplace == null ? (
            <div className="text-muted" style={{ fontSize: 13 }}>Loading...</div>
          ) : marketplaceInstalled ? (
            <>
              <div style={sectionLabel} className="mb-2">Marketplace Listing</div>
              <div style={rowStyle} className="d-flex justify-content-between">
                <span className="text-muted">Listing</span>
                <span className="fw-medium">{marketplace.listing_name}</span>
              </div>
              <div style={rowStyle} className="d-flex justify-content-between">
                <span className="text-muted">Catalog</span>
                <code style={{ fontSize: 12 }}>{marketplace.catalog_name}</code>
              </div>
              <div style={rowStyle} className="d-flex justify-content-between">
                <span className="text-muted">Status</span>
                <span style={{ color: '#31A24C', fontSize: 13 }}>
                  <i className="fa-solid fa-circle-check me-1" />
                  Installed
                </span>
              </div>
            </>
          ) : (
            <Card style={{ border: '1px solid #e9ecef', background: '#fafbfc' }}>
              <Card.Body className="p-3 text-center">
                <i className="fa-solid fa-store mb-2" style={{ fontSize: 20, color: '#adb5bd' }} />
                <div style={{ fontSize: 14, fontWeight: 600 }} className="mb-1">
                  Marketplace listing not detected
                </div>
                <div className="text-muted mb-3" style={{ fontSize: 12 }}>
                  {me?.workspace && (
                    <a
                      href={`${me.workspace}/marketplace/consumer/listings/${LISTING_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Install from Marketplace
                      <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 9 }} />
                    </a>
                  )}
                  {me?.workspace && <span className="mx-1">or</span>}
                  enter your catalog name below.
                </div>
                <div className="d-flex gap-2 mb-2">
                  <Form.Control
                    size="sm"
                    type="text"
                    placeholder="e.g. meta_capi"
                    value={catalogInput}
                    onChange={(e) => {
                      setCatalogInput(e.target.value);
                      setCatalogSaved(false);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!catalogInput.trim() || catalogInput.trim() === catalogOverride}
                    onClick={() => {
                      onCatalogSave(catalogInput.trim());
                      setCatalogSaved(true);
                    }}
                  >
                    Save
                  </Button>
                </div>
                {catalogSaved && (
                  <div className="text-success mb-1" style={{ fontSize: 12 }}>
                    <i className="fa-solid fa-circle-check me-1" />
                    Saved
                  </div>
                )}
                <details style={{ fontSize: 11 }} className="text-muted text-start">
                  <summary style={{ cursor: 'pointer' }}>
                    <i className="fa-solid fa-circle-info me-1" />
                    Forgot your catalog name?
                  </summary>
                  <div className="mt-2 p-2 bg-white rounded border" style={{ textAlign: 'left' }}>
                    <p className="mb-2">
                      Open the{' '}
                      <a
                        href={me?.workspace
                          ? `${me.workspace}/marketplace/consumer/listings/${LISTING_ID}`
                          : '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Meta Conversions API listing
                        <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 9 }} />
                      </a>{' '}
                      and look for <strong>Installation details &gt; Catalog</strong>.
                    </p>
                    <p className="mb-0">
                      Can't access it? Ask your admin to:
                    </p>
                    <ol className="mt-1 mb-0 ps-3">
                      <li>Open the <strong>Meta Conversions API</strong> listing in Marketplace</li>
                      <li>Click <strong>Installation details</strong></li>
                      <li>Share the <strong>Catalog</strong> name with you</li>
                    </ol>
                  </div>
                </details>
              </Card.Body>
            </Card>
          )}
        </Offcanvas.Body>
      </Offcanvas>
    </>
  );
}
