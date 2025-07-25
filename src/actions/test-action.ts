
'use server';

export async function runTestAction(): Promise<{ success: boolean }> {
  console.log('[TEST ACTION] Test action was called successfully!');
  return { success: true };
}
