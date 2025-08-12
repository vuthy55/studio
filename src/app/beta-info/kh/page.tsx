
import React from 'react';
import BetaTesterInfoKhmer from '@/components/marketing/BetaTesterInfoKhmer';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent } from '@/components/ui/card';

export default function BetaInfoKhmerPage() {
  return (
    <div className="space-y-8">
      <MainHeader title="ព័ត៌មានសម្រាប់អ្នកសាកល្បងបែតា" description="សូមអរគុណសម្រាប់ការជួយយើងខ្ញុំក្នុងការសាកល្បង និងកែលម្អ VibeSync។" />
       <Card>
        <CardContent className="pt-6">
            <BetaTesterInfoKhmer />
        </CardContent>
      </Card>
    </div>
  );
}
