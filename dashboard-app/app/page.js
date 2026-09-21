import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/auth';

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  redirect(session ? '/dashboard' : '/login');
}
