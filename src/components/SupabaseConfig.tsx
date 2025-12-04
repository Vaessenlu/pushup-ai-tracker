import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  clearSupabaseOverride,
  getSupabaseConfigMeta,
  setSupabaseOverride,
} from '@/lib/supabaseClient';

export function SupabaseConfig() {
  const meta = useMemo(() => getSupabaseConfigMeta(), []);
  const [url, setUrl] = useState(meta.hasBrowserOverride ? meta.url : '');
  const [anonKey, setAnonKey] = useState(meta.hasBrowserOverride ? meta.anonKey : '');
  const [savedMessage, setSavedMessage] = useState('');

  const handleSave = () => {
    if (!url || !anonKey) {
      setSavedMessage('Bitte URL und Anon Key eintragen.');
      return;
    }
    setSupabaseOverride(url.trim(), anonKey.trim());
    setSavedMessage('Gespeichert. Die Seite lädt neu, damit die neue Supabase-Verbindung aktiv wird.');
    setTimeout(() => window.location.reload(), 300);
  };

  const handleClear = () => {
    clearSupabaseOverride();
    setSavedMessage('Browser-Override entfernt. Lädt neu...');
    setTimeout(() => window.location.reload(), 300);
  };

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Supabase-Verbindung</h2>
        <p className="text-sm text-gray-600">
          Die bisherige Datenbank ist gelöscht. Trage hier die URL und den Anon Key deiner neuen Supabase-Instanz ein
          oder passe sie in der <code>.env</code> an. Aktuell verbunden mit: <strong>{meta.host}</strong>
          {meta.hasBrowserOverride ? ' (Browser-Override aktiv)' : ' (Umgebungsvariable)'}.
        </p>
      </div>

      <div className="space-y-2">
        <Input
          placeholder="https://<dein-projekt>.supabase.co"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Input
          placeholder="Supabase Anon Key"
          value={anonKey}
          onChange={(e) => setAnonKey(e.target.value)}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleSave}>Speichern &amp; neu laden</Button>
        {meta.hasBrowserOverride && (
          <Button variant="outline" onClick={handleClear}>
            Override entfernen
          </Button>
        )}
      </div>

      {savedMessage && <p className="text-sm text-gray-700">{savedMessage}</p>}
    </Card>
  );
}

export default SupabaseConfig;
