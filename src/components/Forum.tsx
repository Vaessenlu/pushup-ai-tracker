import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { fetchPosts, addPost, ForumPost } from '@/lib/forum';
import { MessageCircle } from 'lucide-react';

interface ForumProps {
  token: string | null;
}

export const Forum: React.FC<ForumProps> = ({ token }) => {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [content, setContent] = useState('');

  const load = async () => {
    const p = await fetchPosts();
    setPosts(p);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePost = async () => {
    if (!content.trim()) return;
    await addPost(content);
    setContent('');
    load();
  };

  if (!token) {
    return (
      <Card className="p-6 text-center text-gray-500">
        Bitte zuerst im Community Tab anmelden, um das Forum zu nutzen.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Neuer Beitrag</h3>
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nachricht schreiben..."
        />
        <Button onClick={handlePost}>Posten</Button>
      </Card>
      {posts.map((p) => (
        <Card key={p.id} className="p-4 space-y-1">
          <div className="text-sm text-gray-500">
            {new Date(p.created_at).toLocaleString()} – {p.email}
          </div>
          <p>{p.content}</p>
        </Card>
      ))}
    </div>
  );
};

export default Forum;
