#!/bin/bash
# Script to add 'use client' and fix all import paths in the Next.js project

NEXT_DIR="/Users/austinmakasare/Desktop/YSM/quizbuzz-ops-next"
SRC_DIR="/Users/austinmakasare/Desktop/YSM/quizbuzz-ops-super-admin-dashboard/src"

# Function to prepend 'use client' to a file
add_use_client() {
  local file="$1"
  if ! head -1 "$file" | grep -q "use client"; then
    ed -s "$file" <<< $'1i\n\'use client\';\n\n.\nw\nq'
  fi
}

# Fix imports in a file using sed
fix_imports() {
  local file="$1"
  
  # API imports (relative)
  sed -i '' \
    -e "s|from '\.\./types'|from '@/lib/types'|g" \
    -e "s|from '\.\./data/db'|from '@/lib/data/db'|g" \
    -e "s|from '\./utils'|from '@/lib/api/utils'|g" \
    -e "s|from '\./auth'|from '@/lib/api/auth'|g" \
    -e "s|from '\./auditLog'|from '@/lib/api/auditLog'|g" \
    -e "s|from '\.\./api/auth'|from '@/lib/api/auth'|g" \
    -e "s|from '\.\./api/auditLog'|from '@/lib/api/auditLog'|g" \
    -e "s|from '\.\./api/billing'|from '@/lib/api/billing'|g" \
    -e "s|from '\.\./api/bookings'|from '@/lib/api/bookings'|g" \
    -e "s|from '\.\./api/ops'|from '@/lib/api/ops'|g" \
    -e "s|from '\.\./api/organizations'|from '@/lib/api/organizations'|g" \
    -e "s|from '\.\./api/overview'|from '@/lib/api/overview'|g" \
    -e "s|from '\.\./api/plans'|from '@/lib/api/plans'|g" \
    -e "s|from '\.\./api/utils'|from '@/lib/api/utils'|g" \
    -e "s|from '\.\./hooks/useAuth'|from '@/lib/hooks/useAuth'|g" \
    -e "s|from '\.\./hooks/useAuditLogs'|from '@/lib/hooks/useAuditLogs'|g" \
    -e "s|from '\.\./hooks/useBilling'|from '@/lib/hooks/useBilling'|g" \
    -e "s|from '\.\./hooks/useBookings'|from '@/lib/hooks/useBookings'|g" \
    -e "s|from '\.\./hooks/useOps'|from '@/lib/hooks/useOps'|g" \
    -e "s|from '\.\./hooks/useOrganizations'|from '@/lib/hooks/useOrganizations'|g" \
    -e "s|from '\.\./hooks/usePlans'|from '@/lib/hooks/usePlans'|g" \
    -e "s|from '\.\./hooks/usePlatformStats'|from '@/lib/hooks/usePlatformStats'|g" \
    -e "s|from '\.\./hooks/useSubscription'|from '@/lib/hooks/useSubscription'|g" \
    -e "s|from '\./Toast'|from '@/components/ui/Toast'|g" \
    -e "s|from '\./ThemeToggle'|from '@/components/ui/ThemeToggle'|g" \
    -e "s|from '\./RoleSwitcher'|from '@/components/ui/RoleSwitcher'|g" \
    -e "s|from '\./CommandPalette'|from '@/components/ui/CommandPalette'|g" \
    -e "s|from '\./ComingSoon'|from '@/components/ui/ComingSoon'|g" \
    -e "s|from '\./LoginView'|from '@/components/views/LoginView'|g" \
    -e "s|from '\./OverviewPlaceholder'|from '@/components/views/OverviewView'|g" \
    -e "s|from '\./OrganizationsPlaceholder'|from '@/components/views/OrganizationsView'|g" \
    -e "s|from '\./SubscriptionPlansList'|from '@/components/views/SubscriptionPlansView'|g" \
    -e "s|from '\./OrganizationSubscriptionTab'|from '@/components/views/OrganizationSubscriptionTab'|g" \
    -e "s|from '\./BillingView'|from '@/components/views/BillingView'|g" \
    -e "s|from '\./AuditLogView'|from '@/components/views/AuditLogView'|g" \
    -e "s|from '\./ContestCalculator'|from '@/components/views/ContestCalculatorView'|g" \
    -e "s|from '\./BookingsView'|from '@/components/views/BookingsView'|g" \
    -e "s|from '\./InfraMonitoringView'|from '@/components/views/InfraMonitoringView'|g" \
    -e "s|from '\./FeatureFlagsView'|from '@/components/views/FeatureFlagsView'|g" \
    "$file"
}

echo "Fixing imports in all files..."

# Fix all view components
for f in "$NEXT_DIR/components/views/"*.tsx; do
  add_use_client "$f"
  fix_imports "$f"
  echo "Processed: $f"
done

# Fix all UI components
for f in "$NEXT_DIR/components/ui/"*.tsx; do
  add_use_client "$f"
  fix_imports "$f"
  echo "Processed: $f"
done

echo "Done!"
