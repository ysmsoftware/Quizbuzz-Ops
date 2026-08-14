'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAmbassadorTypes,
  createAmbassadorType,
  updateAmbassadorType,
} from '@/lib/api/ops';
import { AmbassadorApplicationFieldDef } from '@/lib/types';

export function useAmbassadorTypes() {
  const queryClient = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ['ops', 'ambassador-types'],
    queryFn: getAmbassadorTypes,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'ambassador-types'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: {
      key: string;
      label: string;
      description?: string;
      proofFieldLabel: string;
      applicationFields: AmbassadorApplicationFieldDef[];
    }) => createAmbassadorType(input),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      key,
      ...input
    }: {
      key: string;
      label?: string;
      description?: string;
      proofFieldLabel?: string;
      applicationFields?: AmbassadorApplicationFieldDef[];
      isActive?: boolean;
    }) => updateAmbassadorType(key, input),
    onSuccess: invalidate,
  });

  return {
    types: typesQuery.data ?? [],
    isLoadingTypes: typesQuery.isLoading,
    createType: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    createError: createMutation.error as Error | null,
    updateType: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  };
}
