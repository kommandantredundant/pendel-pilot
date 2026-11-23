import { revokeGrant } from '../../../../src/access/api.ts';
import type { AccessContext } from '../../../../src/access/gate.ts';
import type { AccessEnv } from '../../../../src/access/store.ts';

export const onRequestDelete: PagesFunction<AccessEnv> = ({ params, env, data }) =>
  revokeGrant(String(params.id), env, data.access as AccessContext | undefined);
