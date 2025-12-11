import AuthForm from '@/components/AuthForm';
import SupabaseConfig from '@/components/SupabaseConfig';
import { useNavigate } from 'react-router-dom';

export default function LoginPage({ onAuth }: { onAuth: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <AuthForm
        onAuth={() => {
          onAuth();
          navigate('/');
        }}
      />
      <SupabaseConfig />
    </div>
  );
}
