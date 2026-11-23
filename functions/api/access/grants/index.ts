import { createGrant, listGrants } from '../../../../src/access/api.ts';
import type { AccessContext } from '../../../../src/access/gate.ts';
import type { AccessEnv } from '../../../../src/access/store.ts';

export const onRequestGet: PagesFunction<AccessEnv> = ({ env, data }) => listGrants(env, data.access as AccessContext | undefined);

export const onRequestPost: PagesFunction<AccessEnv> = ({ request, env, data }) =>
  createGrant(request, env, data.access as AccessContext | undefined);
