'use client';
import { Workspace } from '@pos/ui';

export default function MerchantDashboard() { return <Workspace mode="admin" apiUrl={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'} />; }
