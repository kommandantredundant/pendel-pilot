import { accessMe } from '../../../src/access/api.ts';
import type { AccessContext } from '../../../src/access/gate.ts';
import type { AccessEnv } from '../../../src/access/store.ts';

export const onRequestGet: PagesFunction<AccessEnv> = ({ env, data }) => accessMe(env, data.access as AccessContext | undefined);
