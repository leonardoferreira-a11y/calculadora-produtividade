import { exigirAdmin } from '@/lib/auth';

import ControleAcessos from './ControleAcessos';

export default async function PaginaAcessos() {
  await exigirAdmin();

  return <ControleAcessos />;
}
