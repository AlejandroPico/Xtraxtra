import {handleRSS} from '../../../rss-service.mjs';
export const dynamic='force-dynamic';
export function GET(request:Request){return handleRSS(request,'feed');}
export function OPTIONS(request:Request){return handleRSS(request,'feed');}
