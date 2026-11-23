import { accessGate } from '../src/access/gate.ts';
import type { AccessEnv } from '../src/access/store.ts';

// Access by invitation for every request (pages, /api, /join). Open while ADMIN_CODE is not set.
export const onRequest: PagesFunction<AccessEnv> = (context) => accessGate(context);
