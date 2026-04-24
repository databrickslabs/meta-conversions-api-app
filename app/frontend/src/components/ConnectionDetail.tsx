import { useState } from 'react';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import Badge from 'react-bootstrap/Badge';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import { postApi } from '../hooks/useApi';
import type { SavedConnection } from '../App';

interface Props {
  connection: SavedConnection;
  onBack: () => void;
  onUpdate: (updated: SavedConnection) => void;
  onQuickStart: () => void;
  onQuickLaunch: () => void;
  onJobSetup: () => void;
}

export default function ConnectionDetail({ connection, onBack, onUpdate, onQuickStart, onQuickLaunch, onJobSetup }: Props) {
  const [editingToken, setEditingToken] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [editScope, setEditScope] = useState(connection.secretScope || '');
  const [editKey, setEditKey] = useState(connection.secretKey || 'access_token');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveToken = async () => {
    if (!newToken.trim()) return;
    const scope = editScope || connection.secretScope;
    const key = editKey || connection.secretKey || 'access_token';

    if (!scope) {
      setSaveError('No secret scope configured. Use Advanced settings to specify a scope.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await postApi<{ success: boolean; message: string; error_type?: string }>(
        '/store-secret',
        {
          access_token: newToken,
          secret_scope: scope,
          secret_key: key,
        }
      );
      if (!res.success) {
        setSaveError(res.message);
        setSaving(false);
        return;
      }
      onUpdate({ ...connection, secretScope: scope, secretKey: key });
      setEditingToken(false);
      setShowAdvanced(false);
      setNewToken('');
      setSaved('Secret updated successfully.');
      setTimeout(() => setSaved(null), 3000);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update secret');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, width: '100%' }}>
      <Button variant="link" className="text-muted mb-3 p-0" onClick={onBack}>
        <i className="fa-solid fa-arrow-left me-1" style={{ fontSize: 12 }} />
        Back to Home
      </Button>

      <Card className="mb-4">
        <Card.Header className="py-3 px-4 d-flex align-items-center gap-3">
          <i className="fa-brands fa-meta" style={{ fontSize: 20, color: 'var(--meta-blue)' }} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Pixel {connection.pixelId}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>
              Created {new Date(connection.createdAt).toLocaleDateString()}
            </div>
          </div>
        </Card.Header>

        <Card.Body className="p-4">
          {saved && (
            <Alert variant="success" className="py-2 small mb-3">
              <i className="fa-solid fa-circle-check me-1" />
              {saved}
            </Alert>
          )}

          <h6 className="mb-3" style={{ fontWeight: 600 }}>Connection Configuration</h6>
          <ListGroup variant="flush">
            <ListGroup.Item className="d-flex justify-content-between align-items-center px-0">
              <span className="text-muted">Pixel ID</span>
              <span className="fw-medium">{connection.pixelId}</span>
            </ListGroup.Item>

            {/* Access Token */}
            <ListGroup.Item className="px-0">
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-muted">Access Token</span>
                {!editingToken ? (
                  <div className="d-flex align-items-center gap-2">
                    {connection.secretScope ? (
                      <Badge bg="light" text="dark" style={{ fontSize: 12 }}>
                        <i className="fa-solid fa-lock me-1" style={{ fontSize: 10 }} />
                        Stored
                      </Badge>
                    ) : (
                      <Badge bg="light" text="muted" style={{ fontSize: 12 }}>
                        Not stored as secret
                      </Badge>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 text-muted"
                      onClick={() => { setEditingToken(true); setSaveError(null); }}
                      title="Overwrite token"
                    >
                      <i className="fa-solid fa-pen" style={{ fontSize: 11 }} />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 text-muted"
                    onClick={() => { setEditingToken(false); setShowAdvanced(false); setNewToken(''); setSaveError(null); }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
              {editingToken && (
                <div className="mt-2">
                  {saveError && (
                    <Alert variant="danger" className="py-2 small mb-2">
                      <i className="fa-solid fa-circle-xmark me-1" />
                      {saveError}
                    </Alert>
                  )}
                  <div className="d-flex gap-2 mb-2">
                    <Form.Control
                      size="sm"
                      type="password"
                      placeholder="Enter new access token"
                      value={newToken}
                      onChange={(e) => setNewToken(e.target.value)}
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveToken}
                      disabled={!newToken.trim() || saving}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {saving ? <Spinner animation="border" size="sm" /> : 'Save'}
                    </Button>
                  </div>
                  {connection.secretScope && (
                    <div className="text-muted mb-2" style={{ fontSize: 12 }}>
                      Secret Scope: <code>{connection.secretScope}</code>
                      {connection.secretKey && <> &middot; Key: <code>{connection.secretKey}</code></>}
                    </div>
                  )}
                  <div
                    role="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--meta-text-secondary)' }}
                    className="mb-1"
                  >
                    <i className={`fa-solid fa-chevron-${showAdvanced ? 'down' : 'right'} me-1`} style={{ fontSize: 10 }} />
                    Advanced
                  </div>
                  {showAdvanced && (
                    <div className="mt-2">
                      <Form.Group className="mb-2" controlId="edit-secretScope">
                        <Form.Label style={{ fontSize: 13 }}>Secret Scope</Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          value={editScope}
                          onChange={(e) => setEditScope(e.target.value)}
                        />
                      </Form.Group>
                      <Form.Group className="mb-2" controlId="edit-secretKey">
                        <Form.Label style={{ fontSize: 13 }}>Secret Key</Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          value={editKey}
                          onChange={(e) => setEditKey(e.target.value)}
                        />
                      </Form.Group>
                    </div>
                  )}
                </div>
              )}
            </ListGroup.Item>

            <ListGroup.Item className="d-flex justify-content-between px-0">
              <span className="text-muted">Created</span>
              <span className="fw-medium">
                {new Date(connection.createdAt).toLocaleString()}
              </span>
            </ListGroup.Item>
          </ListGroup>
        </Card.Body>
      </Card>

      {(connection.resources ?? []).length > 0 && (
        <Card className="mb-4">
          <Card.Body className="p-4">
            <h6 className="mb-3" style={{ fontWeight: 600 }}>Deployed Resources</h6>
            <ListGroup variant="flush">
              {(connection.resources ?? []).map((r) => (
                <ListGroup.Item key={r.url} className="d-flex justify-content-between align-items-center px-0">
                  <div className="d-flex align-items-center gap-2">
                    <img
                      src={r.type === 'job' ? '/WorkflowCodeIcon.svg' : '/notebookIcon.svg'}
                      alt={r.type === 'job' ? 'Job' : 'Notebook'}
                      style={{ width: 16, height: 16 }}
                    />
                    <div>
                      <div className="fw-medium" style={{ fontSize: 14 }}>{r.name}</div>
                      <div className="text-muted" style={{ fontSize: 12 }}>
                        {r.type === 'job' ? 'Job' : 'Notebook'} &middot; {new Date(r.createdAt).toLocaleDateString()}
                        {r.testEventCode ? (
                          <> &middot; Test Code: <code style={{ fontSize: 11 }}>{r.testEventCode}</code></>
                        ) : (
                          <> &middot; No Event Test Code</>
                        )}
                      </div>
                    </div>
                  </div>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline-primary btn-sm"
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square me-1" style={{ fontSize: 11 }} />
                    Open
                  </a>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </Card.Body>
        </Card>
      )}

      <div className="text-center mb-3">
        <h5 style={{ fontWeight: 600 }}>What would you like to do?</h5>
        <p className="text-muted" style={{ fontSize: 14 }}>
          Choose an action for this connection.
        </p>
      </div>

      <Row className="g-3">
        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-bolt" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Quick Start
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Run now with Databricks Marketplace sample dataset to see results.
              </Card.Text>
              <Button variant="primary" onClick={onQuickStart}>
                <i className="fa-solid fa-play me-1" />
                Run Now
              </Button>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-rocket" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Deploy Notebook
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Deploy a customizable and ready-to-run notebook to your workspace.
              </Card.Text>
              <Button variant="outline-primary" onClick={onQuickLaunch}>
                <i className="fa-solid fa-rocket me-1" />
                Deploy
              </Button>
            </Card.Body>
          </Card>
        </Col>

        <Col md={4}>
          <Card className="h-100 launch-tile text-center">
            <Card.Body className="p-4 d-flex flex-column">
              <div className="mb-3">
                <i className="fa-solid fa-gears" style={{ fontSize: '2rem', color: 'var(--meta-blue)' }} />
              </div>
              <Card.Title as="h5" style={{ fontWeight: 600 }}>
                Set Up a Job
              </Card.Title>
              <Card.Text className="text-muted flex-grow-1" style={{ fontSize: 14 }}>
                Configure column mappings for your own data and set up a
                recurring job to send conversion events.
              </Card.Text>
              <Button variant="outline-primary" onClick={onJobSetup}>
                <i className="fa-solid fa-wrench me-1" />
                Configure Job
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
