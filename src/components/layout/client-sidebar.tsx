"use client";

import dynamic from 'next/dynamic'

const AppSidebar = dynamic(() => import('@/components/layout/app-sidebar').then(mod => mod.AppSidebar), {
  ssr: false,
});

export default function ClientSidebar() {
  return <AppSidebar />;
}
