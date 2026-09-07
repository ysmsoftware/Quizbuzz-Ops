export interface DepartmentDetail {
  id: string;
  collegeId: string;
  name: string;
  isActive: boolean;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollegeDetail {
  id: string;
  name: string;
  state: string | null;
  district: string | null;
  city: string | null;
  isActive: boolean;
  departmentCount: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// "Other" submissions from contest registration — see colleges.repository.ts's
// listUnlistedColleges/listUnlistedDepartments for how these are derived.
export interface UnlistedCollege {
  name: string;
  count: number;
}

export interface UnlistedDepartment {
  collegeId: string | null;
  college: string | null;
  department: string;
  count: number;
}
