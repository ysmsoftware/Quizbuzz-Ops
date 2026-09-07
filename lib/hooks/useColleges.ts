'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getColleges,
  createCollege,
  updateCollege,
  getCollegeDepartments,
  createDepartment,
  updateDepartment,
  getUnlistedRequests,
} from '@/lib/api/ops';

export function useColleges() {
  const queryClient = useQueryClient();

  const collegesQuery = useQuery({
    queryKey: ['ops', 'colleges'],
    queryFn: getColleges,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'colleges'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { name: string; state?: string; district?: string; city?: string }) => createCollege(input),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      state?: string;
      district?: string;
      city?: string;
      isActive?: boolean;
    }) => updateCollege(id, input),
    onSuccess: invalidate,
  });

  return {
    colleges: collegesQuery.data ?? [],
    isLoadingColleges: collegesQuery.isLoading,
    createCollege: createMutation.mutateAsync,
    isCreatingCollege: createMutation.isPending,
    createCollegeError: createMutation.error as Error | null,
    updateCollege: updateMutation.mutateAsync,
    isUpdatingCollege: updateMutation.isPending,
  };
}

export function useCollegeDepartments(collegeId: string) {
  const queryClient = useQueryClient();

  const departmentsQuery = useQuery({
    queryKey: ['ops', 'colleges', collegeId, 'departments'],
    queryFn: () => getCollegeDepartments(collegeId),
    enabled: !!collegeId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ops', 'colleges', collegeId, 'departments'] });
    // Also refresh the top-level college list — its departmentCount would otherwise go
    // stale until the page is reloaded, since that list is a separate cached query.
    queryClient.invalidateQueries({ queryKey: ['ops', 'colleges'] });
    queryClient.invalidateQueries({ queryKey: ['auditLogs'] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { name: string }) => createDepartment(collegeId, input),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ departmentId, ...input }: { departmentId: string; name?: string; isActive?: boolean }) =>
      updateDepartment(collegeId, departmentId, input),
    onSuccess: invalidate,
  });

  return {
    departments: departmentsQuery.data ?? [],
    isLoadingDepartments: departmentsQuery.isLoading,
    createDepartment: createMutation.mutateAsync,
    isCreatingDepartment: createMutation.isPending,
    createDepartmentError: createMutation.error as Error | null,
    updateDepartment: updateMutation.mutateAsync,
  };
}

export function useUnlistedRequests() {
  const query = useQuery({
    queryKey: ['ops', 'colleges', 'unlisted'],
    queryFn: getUnlistedRequests,
  });

  return {
    unlistedColleges: query.data?.colleges ?? [],
    unlistedDepartments: query.data?.departments ?? [],
    isLoadingUnlisted: query.isLoading,
  };
}
