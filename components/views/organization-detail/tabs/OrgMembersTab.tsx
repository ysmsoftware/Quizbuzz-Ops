'use client';

import React from 'react';
import { format } from 'date-fns';
import { Member } from '@/lib/types';

interface OrgMembersTabProps {
  members: Member[];
  isLoadingMembers: boolean;
}

export default function OrgMembersTab({ members, isLoadingMembers }: OrgMembersTabProps) {
  return (
    <div className="bg-card border border-border/30 rounded-xl overflow-hidden shadow-sm font-sans">
      <div className="px-6 py-4 bg-secondary/10 border-b border-border/25">
        <h3 className="font-semibold text-sm">Tenant Authorized Administrators</h3>
        <p className="text-[11px] text-muted-foreground">Staff members authorized to login to the tenant's own dashboard.</p>
      </div>

      <div className="overflow-x-auto">
        {isLoadingMembers ? (
          <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading staff logs...</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center text-xs text-muted-foreground">No administrators found.</div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border/30 bg-secondary/5 text-muted-foreground font-semibold">
                <th className="py-3 px-6">Name</th>
                <th className="py-3 px-6">Email Address</th>
                <th className="py-3 px-6">Access Role</th>
                <th className="py-3 px-6 text-right">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/25">
              {members.map(member => (
                <tr key={member.id} className="hover:bg-secondary/15 transition-all">
                  <td className="py-3.5 px-6 font-semibold text-foreground flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-secondary/80 flex items-center justify-center text-[10px] font-bold">
                      {member.name.charAt(0)}
                    </div>
                    <span>{member.name}</span>
                  </td>
                  <td className="py-3.5 px-6 font-mono text-muted-foreground">{member.email}</td>
                  <td className="py-3.5 px-6">
                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${
                      member.role === 'Owner' 
                        ? 'bg-primary/10 text-primary border-primary/20' 
                        : member.role === 'Admin' 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right text-muted-foreground font-mono">
                    {format(new Date(member.joinedDate), 'dd MMM yyyy')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
