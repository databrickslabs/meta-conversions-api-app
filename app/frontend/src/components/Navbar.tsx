import { useEffect } from 'react';
import Container from 'react-bootstrap/Container';
import Navbar from 'react-bootstrap/Navbar';
import { useApi } from '../hooks/useApi';

interface MeData {
  user_name: string;
  workspace: string;
  default_workspace_path?: string | null;
}

interface Props {
  profileKey: number;
  onHome?: () => void;
}

export default function AppNavbar({ profileKey, onHome }: Props) {
  const { data: me, refetch } = useApi<MeData>('/me');

  useEffect(() => {
    if (profileKey > 0) {
      refetch();
    }
  }, [profileKey, refetch]);

  return (
    <Navbar className="meta-navbar shadow-sm">
      <Container fluid className="px-4">
        <Navbar.Brand
          className="d-flex align-items-center gap-2"
          style={{ cursor: onHome ? 'pointer' : undefined }}
          onClick={onHome}
        >
          <img
            src="/assets/meta-logo-white.svg"
            alt="Meta"
            style={{ height: 36 }}
          />
          <span className="nav-separator">|</span>
          <span className="nav-title">Conversions API</span>
        </Navbar.Brand>
        <span className="nav-user">
          {me ? `Hello, ${me.user_name}` : 'Connecting...'}
        </span>
      </Container>
    </Navbar>
  );
}
