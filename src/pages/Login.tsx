import AuthForm from '@/components/AuthForm';
import { useNavigate } from 'react-router-dom';

export default function LoginPage({ onAuth }: { onAuth: () => void }) {
  const navigate = useNavigate();
  return (
    <AuthForm
      onAuth={() => {
        onAuth();
        navigate('/');
      }}
    />
  );
}
