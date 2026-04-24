import { useState, useEffect } from 'react';
import Card from 'react-bootstrap/Card';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Alert from 'react-bootstrap/Alert';
import Spinner from 'react-bootstrap/Spinner';
import { postApi, useApi } from '../hooks/useApi';
import type { CAPIConfig, ConnectionResource } from '../App';

interface MeData {
  user_name: string;
  workspace: string;
  default_workspace_path?: string | null;
}

interface Props {
  profileKey: number;
  config: CAPIConfig;
  onBack: () => void;
  onDone: () => void;
  onResourceCreated?: (resource: ConnectionResource) => void;
}

const LISTING_ID = '8a8f4ead-db28-45e9-b39b-aabbbe1dbe08';

export default function QuickLaunch({ profileKey, config, onBack, onDone, onResourceCreated }: Props) {
  const { data: me, loading, refetch } = useApi<MeData>('/me');
  const [testEventCode, setTestEventCode] = useState(config.testEventCode || '');
  const [workspacePath, setWorkspacePath] = useState('/Workspace/Users/');
  const [pathTouched, setPathTouched] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    if (profileKey > 0) {
      setPathTouched(false);
      setWorkspacePath('/Workspace/Users/');
      refetch();
    }
  }, [profileKey, refetch]);

  useEffect(() => {
    if (pathTouched || !me || loading) {
      return;
    }
    setWorkspacePath(me.default_workspace_path ?? '/Workspace/Users/');
  }, [me?.default_workspace_path, pathTouched, me, loading]);
  const [result, setResult] = useState<{ success: boolean; message: string; notebook_url?: string; mapping_source?: string; marketplace_mapping_path?: string } | null>(null);

  const handleDeploy = async () => {
    setDeploying(true);
    setResult(null);
    try {
      const res = await postApi<{ success: boolean; message: string; notebook_url?: string; mapping_source?: string; marketplace_mapping_path?: string }>(
        '/quick-launch',
        {
          access_token: config.accessToken,
          pixel_id: config.pixelId,
          test_event_code: testEventCode || null,
          secret_scope: config.secretScope || 'meta-capi',
          workspace_path: workspacePath,
        }
      );
      setResult(res);
      if (res.success && res.notebook_url && onResourceCreated) {
        onResourceCreated({
          type: 'notebook',
          url: res.notebook_url,
          name: 'Meta CAPI - UDTF Example',
          createdAt: new Date().toISOString(),
          testEventCode: testEventCode || undefined,
        });
      }
    } catch (err: unknown) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Deployment failed',
      });
    } finally {
      setDeploying(false);
    }
  };

  if (result) {
    return (
      <Card style={{ maxWidth: 560, width: '100%' }}>
        <Card.Body className="p-5 text-center">
          <div className="mb-3">
            <i
              className={`fa-solid ${result.success ? 'fa-circle-check' : 'fa-circle-xmark'}`}
              style={{ fontSize: '2.5rem', color: result.success ? '#31A24C' : '#E4002B' }}
            />
          </div>
          <Alert variant={result.success ? 'success' : 'danger'} className="border-0">
            {result.message}
          </Alert>
          {result.success && result.notebook_url && (
            <a
              href={result.notebook_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary mb-3"
            >
              <i className="fa-solid fa-arrow-up-right-from-square me-1" />
              Open Notebook
            </a>
          )}
          <div>
            <Button variant="outline-secondary" onClick={onDone}>
              Back to Home
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card style={{ maxWidth: 560, width: '100%' }}>
      <Card.Header className="py-3 px-4">
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          <i className="fa-solid fa-rocket me-2" style={{ color: 'var(--meta-blue)' }} />
          Deploy Meta CAPI Notebook with{' '}
          <a
            href={`${me?.workspace || ''}/marketplace/consumer/listings/${LISTING_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline' }}
          >Sample Dataset</a>
        </span>
      </Card.Header>

      <Card.Body className="p-4">
        <p className="text-muted" style={{ fontSize: 14 }}>
          Deploy a ready-to-run Meta CAPI notebook with sample data to your Databricks workspace.
          The notebook reads conversion events from the Marketplace dataset, maps columns,
          and sends them to Meta — ready to run or customize.
        </p>

        <Form.Group className="mb-4" controlId="ql-testEventCode">
          <Form.Label>Event Test Code</Form.Label>
          <Form.Control
            type="text"
            value={testEventCode}
            onChange={(e) => setTestEventCode(e.target.value)}
            placeholder="Optional — e.g. TEST12345"
          />
          <Form.Text className="text-muted">
            Optional. Use a{' '}
            <a
              href="https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#testEvents"
              target="_blank"
              rel="noopener noreferrer"
            >
              test code
              <i className="fa-solid fa-arrow-up-right-from-square ms-1" style={{ fontSize: 10 }} />
            </a>{' '}
            to verify events in Meta Events Manager before sending production data.
          </Form.Text>
        </Form.Group>

        <Form>
          <Form.Group className="mb-4" controlId="ql-workspacePath">
            <Form.Label>Workspace Path</Form.Label>
            <Form.Control
              type="text"
              placeholder="/Workspace/Users/you@company.com"
              value={workspacePath}
              onChange={(e) => {
                setPathTouched(true);
                setWorkspacePath(e.target.value);
              }}
            />
            <Form.Text className="text-muted">
              Where the notebook and mapping files will be created. Defaults to your user folder.
            </Form.Text>
          </Form.Group>

        </Form>
      </Card.Body>

      <Card.Footer className="d-flex justify-content-between py-3 px-4">
        <Button variant="outline-secondary" onClick={onBack}>
          <i className="fa-solid fa-arrow-left me-1" style={{ fontSize: 12 }} />
          Back
        </Button>
        <Button variant="primary" onClick={handleDeploy} disabled={deploying || !workspacePath}>
          {deploying ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" />
              Deploying...
            </>
          ) : (
            <>
              <i className="fa-solid fa-rocket me-1" />
              Deploy to Workspace
            </>
          )}
        </Button>
      </Card.Footer>
    </Card>
  );
}
