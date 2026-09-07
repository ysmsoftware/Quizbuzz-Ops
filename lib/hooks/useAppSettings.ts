'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAppLogo, uploadAppLogo, removeAppLogo } from '@/lib/api/ops';

export function useAppSettings() {
  const queryClient = useQueryClient();

  const appLogoQuery = useQuery({
    queryKey: ['ops', 'app-settings', 'app-logo'],
    queryFn: getAppLogo,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'app-settings', 'app-logo'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const uploadMutation = useMutation({
    mutationFn: (input: { fileData: string; fileName: string }) => uploadAppLogo(input),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: () => removeAppLogo(),
    onSuccess: invalidate,
  });

  return {
    appLogoUrl: appLogoQuery.data?.appLogoUrl ?? null,
    isLoading: appLogoQuery.isLoading,
    uploadAppLogo: uploadMutation.mutateAsync,
    isUploading: uploadMutation.isPending,
    removeAppLogo: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
  };
}
