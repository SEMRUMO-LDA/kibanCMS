# Collection Builder — Feature Documentation

## Overview
The Collection Builder is a visual, step-by-step wizard for creating custom content collections in KibanCMS, similar to Advanced Custom Fields (ACF) or Strapi's content-type builder. It allows admins to create collections with custom fields without touching the database directly.

## Architecture

### Backend (API)
**File**: [apps/api/src/routes/collections.ts](../apps/api/src/routes/collections.ts)

New endpoints added:
- `POST /api/v1/collections` — Create new collection
- `PUT /api/v1/collections/:slug` — Update existing collection
- `DELETE /api/v1/collections/:slug` — Delete collection (cascade deletes entries)

**Features**:
- Admin-only access (role check)
- Slug validation (lowercase, alphanumeric, hyphens only)
- Duplicate slug prevention
- Field schema validation
- Full CRUD operations

### Frontend Components

#### 1. **FieldEditor Component**
**File**: [apps/admin/src/components/collection-builder/FieldEditor.tsx](../apps/admin/src/components/collection-builder/FieldEditor.tsx)

Individual field configuration editor with:
- Collapsible UI for space efficiency
- Drag handle for reordering
- Type-specific configuration options
- Validation settings (required, unique, searchable)
- Auto-slug generation from label
- Real-time preview of field metadata

**Supported field types**:
- Text (text, textarea, richtext, slug, email, url)
- Number (number, integer)
- Boolean (boolean, switch)
- DateTime (date, datetime, time)
- Selection (select, multiselect, radio, checkbox, tags)
- Media (image, file, media)
- Advanced (color, json, blocks, relation)

#### 2. **FieldTypeSelector Component**
**File**: [apps/admin/src/components/collection-builder/FieldTypeSelector.tsx](../apps/admin/src/components/collection-builder/FieldTypeSelector.tsx)

Modal for selecting field type when adding new fields:
- Organized by category (Text, Number, Boolean, etc.)
- Visual cards with icons and descriptions
- Search-friendly layout

#### 3. **CollectionBuilder Page**
**File**: [apps/admin/src/pages/CollectionBuilder.tsx](../apps/admin/src/pages/CollectionBuilder.tsx)

Main wizard page with 3 steps:

**Step 1: Choose Template**
- Start from scratch (empty collection)
- Or use a preset (Blog, Products, Team, etc.)
- Presets load with pre-configured fields

**Step 2: Collection Details**
- Name, slug, description
- Collection type (post, page, custom)
- Auto-slug generation from name

**Step 3: Configure Fields**
- Visual field builder
- Drag & drop to reorder fields
- Add/edit/delete fields
- Type-specific configuration
- Real-time validation

### Integration

#### Collections Page
**File**: [apps/admin/src/pages/Collections.tsx](../apps/admin/src/pages/Collections.tsx)

Changes:
- Added "New Collection" button (admin-only)
- Button navigates to `/content/builder`
- Updated header layout to accommodate button

#### App Routing
**File**: [apps/admin/src/App.tsx](../apps/admin/src/App.tsx)

New route:
```tsx
<Route path="content/builder" element={<CollectionBuilder />} />
```

## Usage Flow

### Creating a Collection

1. **Navigate to Collections**
   - Go to `/content` (Collections page)
   - Click "New Collection" button (admin-only)

2. **Step 1: Choose Template**
   - Select "From Scratch" for empty collection
   - OR select a preset (e.g., "Blog Posts") to start with pre-configured fields
   - Click "Next"

3. **Step 2: Collection Details**
   - Enter collection name (e.g., "Portfolio Projects")
   - Slug auto-generates (e.g., "portfolio-projects")
   - Add description (optional)
   - Select type: post, page, or custom
   - Click "Next"

4. **Step 3: Configure Fields**
   - Click "Add Field" to open field type selector
   - Select field type (e.g., "Text", "Rich Text", "Image")
   - Configure field:
     - Label (display name)
     - Name (database column - auto-generated from label)
     - Placeholder, help text
     - Validation (required, unique, searchable)
     - Type-specific options (min/max length, options for select, etc.)
   - Drag fields to reorder
   - Click "Create Collection"

5. **Result**
   - Collection is created in database
   - Redirects to collection entries page (`/content/:slug`)
   - Ready to create entries with custom fields

## Example: Creating a "Team Members" Collection

```typescript
// Step 1: From Scratch or use "Team Members" preset

// Step 2: Details
{
  name: "Team Members",
  slug: "team",
  description: "Company team members",
  type: "custom"
}

// Step 3: Fields
{
  fields: [
    {
      label: "Full Name",
      name: "full_name",
      type: "text",
      required: true
    },
    {
      label: "Role",
      name: "role",
      type: "text",
      required: true
    },
    {
      label: "Photo",
      name: "photo",
      type: "image"
    },
    {
      label: "Bio",
      name: "bio",
      type: "textarea",
      maxLength: 500
    },
    {
      label: "LinkedIn",
      name: "linkedin",
      type: "url"
    }
  ]
}
```

## Technical Details

### Field Schema Format
Fields are stored as JSONB in the `collections.fields` column:

```typescript
interface FieldDefinition {
  id: string;           // Unique ID for React keys
  name: string;         // Database column name
  type: string;         // Field type (text, number, etc.)
  label: string;        // Display label
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;

  // Type-specific
  maxLength?: number;
  minLength?: number;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  accept?: string;
  multiple?: boolean;
  defaultValue?: any;
}
```

### Security
- Only admins can create/edit/delete collections (role check)
- Slug validation prevents SQL injection
- Field schema is validated before saving
- Cascade delete ensures data integrity

### Database Schema
Collections are stored in the `collections` table:

```sql
CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('post', 'page', 'custom')),
  icon TEXT,
  color TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Future Enhancements

### Planned Features
- [ ] Edit existing collections (PUT endpoint)
- [ ] Delete collections with confirmation modal
- [ ] Field templates (reusable field configurations)
- [ ] Conditional field visibility
- [ ] Field groups and tabs
- [ ] Advanced field types (repeater, flexible content)
- [ ] Collection relationships (foreign keys)
- [ ] Import/export collection schemas
- [ ] Migration system for schema changes
- [ ] Field validation rules (regex, custom functions)
- [ ] Default values and auto-generation
- [ ] SEO configuration per collection
- [ ] Custom API endpoints per collection

### Known Limitations
- Cannot rename slug after creation (would break entries)
- No migration system for existing entries when schema changes
- No undo/redo in field editor
- No field validation testing before creation

## Testing Checklist

- [ ] Create collection from scratch
- [ ] Create collection from preset
- [ ] Add all field types
- [ ] Reorder fields via drag & drop
- [ ] Edit field configuration
- [ ] Delete fields
- [ ] Validate required fields (name, slug, type)
- [ ] Test slug uniqueness validation
- [ ] Test slug format validation (lowercase, hyphens only)
- [ ] Test admin-only access (non-admins cannot see button)
- [ ] Create entries with custom fields
- [ ] Verify field types render correctly in EntryEditor

## Related Files

### Core Implementation
- API Routes: `apps/api/src/routes/collections.ts`
- Main Page: `apps/admin/src/pages/CollectionBuilder.tsx`
- Field Editor: `apps/admin/src/components/collection-builder/FieldEditor.tsx`
- Type Selector: `apps/admin/src/components/collection-builder/FieldTypeSelector.tsx`

### Configuration
- Presets: `apps/admin/src/config/collection-presets.ts`
- Schema Types: `packages/types/src/schema.types.ts`

### Integration Points
- Collections List: `apps/admin/src/pages/Collections.tsx`
- App Routing: `apps/admin/src/App.tsx`
- Entry Editor: `apps/admin/src/components/EntryEditor.tsx` (reads field schema)

## API Examples

### Create Collection
```bash
curl -X POST http://localhost:5001/api/v1/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Portfolio Projects",
    "slug": "projects",
    "description": "My portfolio work",
    "type": "custom",
    "icon": "briefcase",
    "color": "purple",
    "fields": [
      {
        "id": "field-1",
        "name": "title",
        "type": "text",
        "label": "Project Title",
        "required": true
      },
      {
        "id": "field-2",
        "name": "description",
        "type": "richtext",
        "label": "Description",
        "required": true
      }
    ]
  }'
```

### Update Collection
```bash
curl -X PUT http://localhost:5001/api/v1/collections/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Portfolio",
    "description": "Updated description"
  }'
```

### Delete Collection
```bash
curl -X DELETE http://localhost:5001/api/v1/collections/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

**Last Updated**: 2026-04-02
**Version**: 1.0
**Status**: ✅ Implemented
