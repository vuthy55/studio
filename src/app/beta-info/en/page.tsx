
import React from 'react';
import BetaTesterInfo from '@/components/marketing/BetaTesterInfo';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function BetaInfoEnglishPage() {
  return (
    <div className="space-y-8">
      <MainHeader title="Beta Tester Information" description="Thank you for helping us test and refine VibeSync." />
      <Card>
        <CardContent className="pt-6">
            <BetaTesterInfo />
        </CardContent>
      </Card>
    </div>
  );
}
