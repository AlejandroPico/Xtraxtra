import {handleRSS} from '../../../rss-service.mjs';
export const dynamic='force-dynamic';
export function GET(request:Request){return handleRSS(request,'discover');}
export function OPTIONS(request:Request){return handleRSS(request,'discover');}
