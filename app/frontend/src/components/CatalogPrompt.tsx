import { useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';

interface Profile {
  name: string;
  host: string;
  active: boolean;
}

const LISTING_ID = '8a8f4ead-db28-45e9-b39b-aabbbe1dbe08';

interface Props {
  onSubmit: (catalogName: string) => void;
  onSkip: () => void;
  workspace?: string;
  profiles?: Profile[];
  activeProfile?: string;
  onProfileSwitch?: (profileName: string) => Promise<void>;
}

export default function CatalogPrompt({
  onSubmit,
  onSkip,
  workspace,
  profiles,
  activeProfile,
  onProfileSwitch,
}: Props) {
  const [catalogName, setCatalogName] = useState('');
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [switching, setSwitching] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = catalogName.trim();
    if (trimmed) {
      onSubmit(trimmed);
    }
  };

  const handleProfileSwitch = async (profileName: string) => {
    if (!onProfileSwitch) return;
    setSwitching(true);
    try {
      await onProfileSwitch(profileName);
    } finally {
      setSwitching(false);
    }
  };

  const showProfileSelector = profiles && profiles.length > 1 && onProfileSwitch;

  return (
    <Modal
      show
      centered
      backdrop="static"
      keyboard={false}
      size="lg"
    >
      <Modal.Header>
        <Modal.Title>
          <i className="fa-solid fa-database me-2" />
          Enter Your Catalog Name
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-3">
          We couldn't automatically detect the Unity Catalog associated with your
          Marketplace listing. Please enter the catalog name you chose when you
          installed the <strong>Meta Conversions API</strong> listing from{' '}
          {workspace ? (
            <a href={`${workspace}/marketplace/consumer/listings/${LISTING_ID}`} target="_blank" rel="noopener noreferrer">
              Databricks Marketplace
            </a>
          ) : (
            <>Databricks Marketplace</>
          )}.
        </p>

        {showProfileSelector && (
          <div className="mb-3 p-3 rounded" style={{ background: 'var(--meta-bg-alt)' }}>
            <Form.Label className="mb-1" style={{ fontSize: 13 }}>
              <i className="fa-solid fa-arrow-right-arrow-left me-1" />
              Wrong workspace? Switch profile first:
            </Form.Label>
            <div className="d-flex align-items-center gap-2">
              <Form.Select
                size="sm"
                value={activeProfile}
                onChange={(e) => handleProfileSwitch(e.target.value)}
                disabled={switching}
              >
                {profiles.map(p => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </Form.Select>
              {switching && <Spinner animation="border" size="sm" />}
            </div>
            {!switching && activeProfile && (
              <div style={{ fontSize: 12 }} className="text-muted mt-1">
                {profiles.find(p => p.name.toUpperCase() === activeProfile.toUpperCase())?.host || ''}
              </div>
            )}
          </div>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label>Catalog name</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. meta_meta_conversions_api"
              value={catalogName}
              onChange={(e) => setCatalogName(e.target.value)}
              autoFocus
            />
            <Form.Text className="text-muted">
              This is the catalog name you entered during the Marketplace listing
              installation — it's where the shared data and notebooks are stored
              in your workspace.
            </Form.Text>
          </Form.Group>

          <div className="d-flex justify-content-between align-items-center mt-4">
            <Button
              variant="link"
              className="text-muted px-0"
              style={{ fontSize: 14 }}
              onClick={() => setShowSkipWarning(true)}
            >
              Skip for now
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={!catalogName.trim()}
            >
              Continue
            </Button>
          </div>
        </Form>

        {showSkipWarning && (
          <Alert variant="warning" className="mt-3 mb-0">
            <i className="fa-solid fa-triangle-exclamation me-2" />
            <strong>Are you sure?</strong> Without a catalog name, you won't be
            able to deploy notebooks or create jobs — the app needs it to locate
            your Marketplace data.
            <div className="mt-2 d-flex gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowSkipWarning(false)}
              >
                Go back
              </Button>
              <Button
                variant="warning"
                size="sm"
                onClick={onSkip}
              >
                Skip anyway
              </Button>
            </div>
          </Alert>
        )}
      </Modal.Body>
    </Modal>
  );
}
