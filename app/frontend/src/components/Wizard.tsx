import { useState } from 'react';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import ProgressBar from 'react-bootstrap/ProgressBar';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { postApi } from '../hooks/useApi';
import type { CAPIConfig } from '../App';

interface Props {
  onClose: () => void;
  onComplete: (config: CAPIConfig) => void;
}

const STEPS = ['Setup', 'Review'];

export default function Wizard({ onClose, onComplete }: Props) {
  const [step, setStep] = useState(0);

  // Step 1: credentials
  const [accessToken, setAccessToken] = useState('');
  const [pixelId, setPixelId] = useState('');

  // Secret storage
  const [storeAsSecret, setStoreAsSecret] = useState(true);
  const [showSecretAdvanced, setShowSecretAdvanced] = useState(false);
  const [secretScope, setSecretScope] = useState('');
  const [secretScopeTouched, setSecretScopeTouched] = useState(false);
  const [secretKey, setSecretKey] = useState('access_token');
  const [savingSecret, setSavingSecret] = useState(false);
  const [secretError, setSecretError] = useState<{ message: string; errorType?: string } | null>(null);

  const defaultScope = pixelId ? `meta_capi_pixel_${pixelId}` : '';
  const effectiveScope = secretScopeTouched ? secretScope : defaultScope;

  // Test connection
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Result
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const progress = ((step + 1) / STEPS.length) * 100;

  // Disable Save if test connection explicitly failed or secret is saving
  const isSaveDisabled = testing || savingSecret;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await postApi<{ success: boolean; message: string }>('/test-connection', {
        access_token: accessToken,
        pixel_id: pixelId,
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleFinish = async () => {
    setTestResult(null);
    setSecretError(null);

    if (storeAsSecret) {
      setSavingSecret(true);
      try {
        const res = await postApi<{ success: boolean; message: string; error_type?: string; secret_scope?: string; secret_key?: string }>(
          '/store-secret',
          {
            access_token: accessToken,
            secret_scope: effectiveScope,
            secret_key: secretKey,
          }
        );
        if (!res.success) {
          setSecretError({ message: res.message, errorType: res.error_type });
          setSavingSecret(false);
          return;
        }
      } catch (err: unknown) {
        setSecretError({ message: err instanceof Error ? err.message : 'Failed to store secret' });
        setSavingSecret(false);
        return;
      }
      setSavingSecret(false);
    }

    setResult({
      success: true,
      message: 'Your Meta Conversions API connector was configured successfully!',
    });
  };

  if (result) {
    return (
      <Card className="text-center" style={{ maxWidth: 560 }}>
        <Card.Body className="p-5">
          <div className="mb-3">
            <i
              className={`fa-solid ${result.success ? 'fa-circle-check' : 'fa-circle-xmark'}`}
              style={{ fontSize: '2.5rem', color: result.success ? '#31A24C' : '#E4002B' }}
            />
          </div>
          <Alert variant={result.success ? 'success' : 'danger'} className="border-0">
            {result.message}
          </Alert>
          <Button
            variant="primary"
            onClick={() =>
              onComplete({
                accessToken,
                pixelId,
                testEventCode: null,
                testCodeMode: 'none',
                testCodeColumn: '',
                secretScope: storeAsSecret ? effectiveScope : undefined,
                secretKey: storeAsSecret ? secretKey : undefined,
              })
            }
          >
            Continue
            <i className="fa-solid fa-arrow-right ms-2" style={{ fontSize: 12 }} />
          </Button>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 560, width: '100%' }}>
      <Card.Header className="py-3 px-4">
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-muted" style={{ fontSize: 13 }}>{STEPS[step]}</span>
        </div>
        <ProgressBar now={progress} style={{ height: 3 }} />
      </Card.Header>

      <Card.Body className="p-4">
        {/* Step 1: Setup */}
        {step === 0 && (
          <>
            <h5 className="mb-2" style={{ fontWeight: 600 }}>
              Setup Meta Conversions API Connector
            </h5>
            <p className="text-muted" style={{ fontSize: 14 }}>
              Before we begin, ensure you have a <strong>Pixel ID</strong> and <strong>access token</strong> from your
              Meta Ads Manager. For more details on how to obtain both visit the{' '}
              <a
                href="https://developers.facebook.com/docs/marketing-api/conversions-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
              >
                Meta Conversions API documentation
                <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 11 }} />
              </a>.
            </p>
            <Form>
              <Form.Group className="mb-3" controlId="pixelId">
                <Form.Label>Pixel ID</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter your Meta Pixel ID"
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="accessToken">
                <Form.Label>Access Token</Form.Label>
                <Form.Control
                  type="password"
                  placeholder="Enter your Meta Access Token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </Form.Group>

              <Form.Check
                type="checkbox"
                id="storeAsSecret"
                label="Store as a Databricks Secret"
                checked={storeAsSecret}
                onChange={(e) => setStoreAsSecret(e.target.checked)}
                className="mb-2"
              />
              {storeAsSecret && (
                <div className="ms-4">
                  <Form.Text className="text-muted d-block mb-2">
                    Your access token will be encrypted and stored in a Databricks secret scope.
                  </Form.Text>
                  <div
                    role="button"
                    onClick={() => setShowSecretAdvanced(!showSecretAdvanced)}
                    style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--meta-text-secondary)' }}
                    className="mb-2"
                  >
                    <i className={`fa-solid fa-chevron-${showSecretAdvanced ? 'down' : 'right'} me-1`} style={{ fontSize: 10 }} />
                    Advanced
                  </div>
                  {showSecretAdvanced && (
                    <>
                      <Form.Group className="mb-2" controlId="secretScope">
                        <Form.Label style={{ fontSize: 13 }}>Secret Scope</Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          value={effectiveScope}
                          onChange={(e) => { setSecretScopeTouched(true); setSecretScope(e.target.value); }}
                          placeholder="meta_capi_pixel_..."
                        />
                        <Form.Text className="text-muted">
                          A new scope will be created if it doesn't exist.
                        </Form.Text>
                      </Form.Group>
                      <Form.Group className="mb-2" controlId="secretKey">
                        <Form.Label style={{ fontSize: 13 }}>Secret Key</Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          value={secretKey}
                          onChange={(e) => setSecretKey(e.target.value)}
                        />
                        <Form.Text className="text-muted">
                          The key name used to store your token within the scope.
                        </Form.Text>
                      </Form.Group>
                    </>
                  )}
                </div>
              )}
            </Form>
          </>
        )}

        {/* Step 2: Review */}
        {step === 1 && (
          <>
            <h5 className="mb-3" style={{ fontWeight: 600 }}>Review Configuration</h5>

            {secretError && (
              <Alert variant="danger" className="mb-3" style={{ fontSize: 13 }}>
                <i className="fa-solid fa-circle-xmark me-1" />
                {secretError.errorType === 'max_scopes' ? (
                  <>
                    Unable to create secret scope — your workspace has reached the maximum number of scopes.
                    You can{' '}
                    <a
                      href="https://docs.databricks.com/aws/en/security/secrets/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      delete an unused scope
                      <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 9 }} />
                    </a>{' '}
                    in your workspace or use the Advanced settings to store this token under an existing scope.
                  </>
                ) : (
                  secretError.message
                )}
              </Alert>
            )}

            <table className="table table-sm mb-3">
              <tbody>
                <tr>
                  <td className="text-muted" style={{ width: 140 }}>Access Token</td>
                  <td>{'•'.repeat(Math.min(accessToken.length, 20)) || '—'}</td>
                </tr>
                <tr>
                  <td className="text-muted">Pixel ID</td>
                  <td>{pixelId || '—'}</td>
                </tr>
                {storeAsSecret && (
                  <>
                    <tr>
                      <td className="text-muted">Secret Scope</td>
                      <td><code style={{ fontSize: 12 }}>{effectiveScope}</code></td>
                    </tr>
                    <tr>
                      <td className="text-muted">Secret Key</td>
                      <td><code style={{ fontSize: 12 }}>{secretKey}</code></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            <div className="d-flex align-items-center gap-3 mb-1">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin me-1" />
                    Testing...
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-plug me-1" />
                    Test Connection
                  </>
                )}
              </Button>
              {testResult && (
                <span style={{ fontSize: 14 }}>
                  {testResult.success ? (
                    <span style={{ color: '#31A24C' }}>
                      <i className="fa-solid fa-circle-check me-1" />
                      {testResult.message}
                    </span>
                  ) : (
                    <span style={{ color: '#E4002B' }}>
                      <i className="fa-solid fa-circle-xmark me-1" />
                      {testResult.message}
                    </span>
                  )}
                </span>
              )}
            </div>
          </>
        )}
      </Card.Body>

      <Card.Footer className="d-flex justify-content-between py-3 px-4">
        <Button
          variant="outline-secondary"
          onClick={step === 0 ? onClose : () => { setTestResult(null); setStep(step - 1); }}
        >
          {step === 0 ? 'Cancel' : (
            <>
              <i className="fa-solid fa-arrow-left me-1" style={{ fontSize: 12 }} />
              Back
            </>
          )}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            variant="primary"
            onClick={() => { setTestResult(null); setStep(step + 1); }}
            disabled={step === 0 && (!accessToken || !pixelId)}
          >
            Next
            <i className="fa-solid fa-arrow-right ms-1" style={{ fontSize: 12 }} />
          </Button>
        ) : (
          <Button variant="primary" onClick={handleFinish} disabled={isSaveDisabled}>
            {savingSecret ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-check me-1" />
                Save Configuration
              </>
            )}
          </Button>
        )}
      </Card.Footer>
    </Card>
  );
}
