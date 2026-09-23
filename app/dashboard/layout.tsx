import { exigirUsuario } from '@/lib/auth';
import MenuDashboard from './MenuDashboard';

export const metadata = {
  title: 'CalculArco - Dashboard',
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await exigirUsuario();

  return <MenuDashboard usuario={usuario}>{children}</MenuDashboard>;
}
