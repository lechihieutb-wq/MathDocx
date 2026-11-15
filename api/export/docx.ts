import type { ServerResponse } from 'node:http';
import { handleExportDocx, type RequestWithOptionalBody } from '../../server/apiApp.ts';

export default async function handler(
  req: RequestWithOptionalBody,
  res: ServerResponse
): Promise<void> {
  await handleExportDocx(req, res);
}
