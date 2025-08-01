export interface EmergencyInfo {
  police: string;
  ambulance: string;
  fire: string;
  touristPolice?: string;
}

export const emergencyData: Record<string, EmergencyInfo> = {
  BN: { police: '993', ambulance: '991', fire: '995' },
  KH: { police: '117', ambulance: '119', fire: '118', touristPolice: '012 999 999' },
  ID: { police: '110', ambulance: '118', fire: '113' },
  LA: { police: '191', ambulance: '195', fire: '190' },
  MY: { police: '999', ambulance: '999', fire: '999' },
  MM: { police: '199', ambulance: '192', fire: '191' },
  PH: { police: '911', ambulance: '911', fire: '911' },
  SG: { police: '999', ambulance: '995', fire: '995' },
  TH: { police: '191', ambulance: '1669', fire: '199', touristPolice: '1155' },
  VN: { police: '113', ambulance: '115', fire: '114' },
};
