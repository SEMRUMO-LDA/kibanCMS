#!/usr/bin/env tsx
/**
 * Seed Script for kibanCMS
 * Populates the database with sample collections and entries
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../apps/admin/.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/admin/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log('🌱 Starting seed process...\n');

  try {
    // Get any admin user (super_admin or admin)
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .or('role.eq.super_admin,role.eq.admin')
      .limit(1);

    if (profileError) {
      console.error('❌ Error fetching profiles:', profileError);
      throw profileError;
    }

    // If no admin, try to get ANY user
    let adminId, adminEmail;
    if (!profiles || profiles.length === 0) {
      console.log('⚠️  No admin user found, looking for any user...');
      const { data: anyUser, error: anyUserError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .limit(1);

      if (anyUserError || !anyUser || anyUser.length === 0) {
        console.error('❌ No users found in the database!');
        console.error('Please create a user first by logging into the admin panel.');
        process.exit(1);
      }

      adminId = anyUser[0].id;
      adminEmail = anyUser[0].email;
      console.log(`ℹ️  Using user: ${adminEmail} (role: ${anyUser[0].role})\n`);
    } else {
      adminId = profiles[0].id;
      adminEmail = profiles[0].email;
      console.log(`👤 Found admin user: ${adminEmail} (${adminId})\n`);
    }

    // Clear existing data
    console.log('🧹 Clearing existing collections and entries...');

    const { error: deleteEntriesError } = await supabase
      .from('entries')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    const { error: deleteCollectionsError } = await supabase
      .from('collections')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    console.log('✅ Cleared existing data\n');

    // Create Blog collection
    console.log('📝 Creating Blog collection...');
    const { data: blogCollection, error: blogError } = await supabase
      .from('collections')
      .insert({
        name: 'Blog Posts',
        slug: 'blog',
        description: 'Articles and news updates',
        type: 'post',
        icon: 'file-text',
        color: 'blue',
        created_by: adminId,
        fields: [
          {
            id: 'title',
            name: 'Title',
            type: 'text',
            required: true,
            maxLength: 200
          },
          {
            id: 'slug',
            name: 'Slug',
            type: 'text',
            required: true,
            maxLength: 200,
            helpText: 'URL-friendly identifier'
          },
          {
            id: 'excerpt',
            name: 'Excerpt',
            type: 'textarea',
            required: false,
            maxLength: 500,
            helpText: 'Short summary for previews'
          },
          {
            id: 'content',
            name: 'Content',
            type: 'richtext',
            required: true,
            helpText: 'Main article content (Markdown supported)'
          },
          {
            id: 'featured_image',
            name: 'Featured Image',
            type: 'image',
            required: false,
            helpText: 'Cover image for the post'
          },
          {
            id: 'published_at',
            name: 'Published Date',
            type: 'date',
            required: false,
            helpText: 'When this post was published'
          }
        ]
      })
      .select()
      .single();

    if (blogError) throw blogError;
    console.log('✅ Blog collection created\n');

    // Create Projects collection
    console.log('💼 Creating Projects collection...');
    const { data: projectsCollection, error: projectsError } = await supabase
      .from('collections')
      .insert({
        name: 'Projects',
        slug: 'projects',
        description: 'Portfolio and case studies',
        type: 'page',
        icon: 'briefcase',
        color: 'purple',
        created_by: adminId,
        fields: [
          {
            id: 'title',
            name: 'Project Title',
            type: 'text',
            required: true,
            maxLength: 200
          },
          {
            id: 'slug',
            name: 'Slug',
            type: 'text',
            required: true,
            maxLength: 200
          },
          {
            id: 'description',
            name: 'Description',
            type: 'textarea',
            required: true,
            maxLength: 1000
          },
          {
            id: 'client',
            name: 'Client Name',
            type: 'text',
            required: false,
            maxLength: 100
          },
          {
            id: 'year',
            name: 'Year',
            type: 'number',
            required: false,
            min: 2000,
            max: 2030
          },
          {
            id: 'featured',
            name: 'Featured Project',
            type: 'boolean',
            required: false,
            helpText: 'Show on homepage'
          }
        ]
      })
      .select()
      .single();

    if (projectsError) throw projectsError;
    console.log('✅ Projects collection created\n');

    // Create sample blog entries
    console.log('📄 Creating sample blog entries...');

    const { error: entry1Error } = await supabase
      .from('entries')
      .insert({
        collection_slug: 'blog',
        slug: 'welcome-to-kibancms',
        status: 'published',
        data: {
          title: 'Welcome to kibanCMS',
          slug: 'welcome-to-kibancms',
          excerpt: 'Getting started with the headless CMS built for developers',
          content: '# Welcome to kibanCMS\n\nThis is your first blog post. kibanCMS is a modern headless CMS that gives you complete control over your content structure.\n\n## Key Features\n\n- Custom collection builder\n- TypeScript API\n- RESTful endpoints\n- Built on Supabase\n\nGet started by creating your own collections!',
          published_at: new Date().toISOString()
        },
        created_by: adminId
      });

    if (entry1Error) throw entry1Error;

    const { error: entry2Error } = await supabase
      .from('entries')
      .insert({
        collection_slug: 'blog',
        slug: 'building-with-api',
        status: 'draft',
        data: {
          title: 'Building with the kibanCMS API',
          slug: 'building-with-api',
          excerpt: 'Learn how to integrate kibanCMS with your frontend',
          content: '# Building with the API\n\nkibanCMS provides a powerful REST API for fetching your content.\n\nUse the API client to easily fetch data in your applications.',
          published_at: null
        },
        created_by: adminId
      });

    if (entry2Error) throw entry2Error;
    console.log('✅ Sample entries created\n');

    console.log('🎉 Seed completed successfully!');
    console.log('\nYou can now:');
    console.log('  1. View collections at http://localhost:5173/content');
    console.log('  2. Create new entries');
    console.log('  3. Fetch data via the API\n');

  } catch (error: any) {
    console.error('❌ Seed failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    if (error.hint) console.error('Hint:', error.hint);
    process.exit(1);
  }
}

seed();
