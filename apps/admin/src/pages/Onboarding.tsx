import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { supabase } from '../lib/supabase';
import { useAuth } from '../features/auth/hooks/useAuth';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  FileText,
  Briefcase,
  Users,
  Package,
  Quote,
  Calendar
} from 'lucide-react';
import { colors, spacing, typography, borders, shadows, animations } from '../shared/styles/design-tokens';
import { COLLECTION_PRESETS, type CollectionPreset } from '../config/collection-presets';

// ============================================
// ANIMATIONS
// ============================================

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const slideIn = keyframes`
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
`;

// ============================================
// STYLED COMPONENTS
// ============================================

const Container = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, ${colors.gray[50]} 0%, ${colors.white} 50%, ${colors.accent[50]} 100%);
  padding: ${spacing[8]};
`;

const Card = styled.div`
  width: 100%;
  max-width: 800px;
  background: ${colors.white};
  border: 1px solid ${colors.gray[200]};
  border-radius: ${borders.radius['2xl']};
  box-shadow: ${shadows.xl};
  overflow: hidden;
  animation: ${fadeIn} ${animations.duration.slow} ${animations.easing.out};
`;

const Header = styled.div`
  padding: ${spacing[8]} ${spacing[8]} ${spacing[6]};
  text-align: center;
  border-bottom: 1px solid ${colors.gray[200]};
  background: linear-gradient(to bottom, ${colors.white}, ${colors.gray[50]});

  .icon-wrapper {
    width: 64px;
    height: 64px;
    margin: 0 auto ${spacing[4]};
    background: linear-gradient(135deg, ${colors.accent[400]}, ${colors.accent[600]});
    border-radius: ${borders.radius.xl};
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: ${shadows.lg};

    svg {
      color: ${colors.white};
    }
  }

  h1 {
    font-size: ${typography.fontSize['2xl']};
    font-weight: ${typography.fontWeight.bold};
    margin: 0 0 ${spacing[2]} 0;
    color: ${colors.gray[900]};
  }

  p {
    font-size: ${typography.fontSize.sm};
    color: ${colors.gray[600]};
    margin: 0;
  }
`;

const StepIndicator = styled.div`
  display: flex;
  justify-content: center;
  gap: ${spacing[2]};
  padding: ${spacing[6]} ${spacing[8]};
  background: ${colors.gray[50]};
`;

const Step = styled.div<{ $active: boolean; $completed: boolean }>`
  flex: 1;
  height: 4px;
  border-radius: ${borders.radius.full};
  background: ${props =>
    props.$completed
      ? colors.accent[500]
      : props.$active
      ? colors.accent[300]
      : colors.gray[200]};
  transition: all ${animations.duration.normal} ${animations.easing.out};
`;

const Content = styled.div`
  padding: ${spacing[8]};
  min-height: 400px;
  animation: ${slideIn} ${animations.duration.normal} ${animations.easing.out};
`;

const FormGroup = styled.div`
  margin-bottom: ${spacing[6]};

  label {
    display: block;
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[700]};
    margin-bottom: ${spacing[2]};
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: ${spacing[3]} ${spacing[4]};
    border: 1px solid ${colors.gray[300]};
    border-radius: ${borders.radius.lg};
    font-size: ${typography.fontSize.base};
    font-family: ${typography.fontFamily.sans};
    color: ${colors.gray[900]};
    transition: all ${animations.duration.fast} ${animations.easing.out};

    &:focus {
      outline: none;
      border-color: ${colors.accent[500]};
      box-shadow: 0 0 0 3px ${colors.accent[500]}20;
    }
  }

  textarea {
    min-height: 100px;
    resize: vertical;
  }

  .help-text {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[500]};
    margin-top: ${spacing[1]};
  }
`;

const ColorPicker = styled.div`
  display: flex;
  gap: ${spacing[3]};
  flex-wrap: wrap;
`;

const ColorOption = styled.button<{ $color: string; $selected: boolean }>`
  width: 48px;
  height: 48px;
  border-radius: ${borders.radius.lg};
  background: ${props => props.$color};
  border: 3px solid ${props => (props.$selected ? colors.gray[900] : 'transparent')};
  cursor: pointer;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  box-shadow: ${shadows.sm};

  &:hover {
    transform: scale(1.1);
    box-shadow: ${shadows.md};
  }
`;

const PresetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${spacing[4]};
  margin-top: ${spacing[4]};
`;

const PresetCard = styled.button<{ $selected: boolean }>`
  padding: ${spacing[4]};
  background: ${props => (props.$selected ? colors.accent[50] : colors.white)};
  border: 2px solid ${props => (props.$selected ? colors.accent[500] : colors.gray[200])};
  border-radius: ${borders.radius.xl};
  cursor: pointer;
  text-align: left;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  position: relative;

  &:hover {
    border-color: ${colors.accent[300]};
    transform: translateY(-2px);
    box-shadow: ${shadows.md};
  }

  .icon {
    width: 40px;
    height: 40px;
    border-radius: ${borders.radius.lg};
    background: ${props => (props.$selected ? colors.accent[100] : colors.gray[100])};
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: ${spacing[3]};

    svg {
      color: ${props => (props.$selected ? colors.accent[600] : colors.gray[600])};
    }
  }

  h3 {
    font-size: ${typography.fontSize.sm};
    font-weight: ${typography.fontWeight.semibold};
    color: ${colors.gray[900]};
    margin: 0 0 ${spacing[1]} 0;
  }

  p {
    font-size: ${typography.fontSize.xs};
    color: ${colors.gray[600]};
    margin: 0;
    line-height: ${typography.lineHeight.relaxed};
  }

  ${props =>
    props.$selected &&
    `
    .check-mark {
      position: absolute;
      top: ${spacing[2]};
      right: ${spacing[2]};
      width: 24px;
      height: 24px;
      border-radius: ${borders.radius.full};
      background: ${colors.accent[500]};
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        color: ${colors.white};
      }
    }
  `}
`;

const Footer = styled.div`
  padding: ${spacing[6]} ${spacing[8]};
  border-top: 1px solid ${colors.gray[200]};
  display: flex;
  justify-content: space-between;
  gap: ${spacing[4]};
  background: ${colors.gray[50]};
`;

const Button = styled.button<{ $variant?: 'primary' | 'secondary' }>`
  padding: ${spacing[3]} ${spacing[6]};
  border-radius: ${borders.radius.lg};
  font-size: ${typography.fontSize.sm};
  font-weight: ${typography.fontWeight.semibold};
  font-family: ${typography.fontFamily.sans};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: ${spacing[2]};
  transition: all ${animations.duration.fast} ${animations.easing.out};
  border: none;

  ${props =>
    props.$variant === 'primary'
      ? `
    background: ${colors.accent[500]};
    color: ${colors.white};
    box-shadow: ${shadows.sm};

    &:hover:not(:disabled) {
      background: ${colors.accent[600]};
      transform: translateY(-1px);
      box-shadow: ${shadows.md};
    }
  `
      : `
    background: ${colors.white};
    color: ${colors.gray[700]};
    border: 1px solid ${colors.gray[300]};

    &:hover:not(:disabled) {
      background: ${colors.gray[50]};
      border-color: ${colors.gray[400]};
    }
  `}

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
`;

// ============================================
// TYPES
// ============================================

interface ManifestData {
  name: string;
  brand_color: string;
  description: string;
  industry: string;
  collections_preset: string[];
  timezone: string;
  language: string;
}

const BRAND_COLORS = [
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Green', value: '#10B981' },
  { name: 'Gray', value: '#6B7280' },
];

const ICON_MAP: Record<string, any> = {
  'file-text': FileText,
  briefcase: Briefcase,
  users: Users,
  package: Package,
  quote: Quote,
  calendar: Calendar,
};

// ============================================
// COMPONENT
// ============================================

export const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [manifest, setManifest] = useState<ManifestData>({
    name: '',
    brand_color: '#06B6D4',
    description: '',
    industry: '',
    collections_preset: ['blog-posts', 'portfolio-projects'],
    timezone: 'Europe/Lisbon',
    language: 'en',
  });

  const totalSteps = 3;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const togglePreset = (presetId: string) => {
    setManifest(prev => ({
      ...prev,
      collections_preset: prev.collections_preset.includes(presetId)
        ? prev.collections_preset.filter(id => id !== presetId)
        : [...prev.collections_preset, presetId],
    }));
  };

  const handleComplete = async () => {
    setLoading(true);

    try {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('[Onboarding] Starting completion for user:', user.id);

      // 1. Ensure user has admin role (first user = super_admin) and save manifesto
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single() as { data: { role: string | null } | null; error: any };

      const updateData: Record<string, any> = {
        onboarding_completed: true,
        project_manifesto: {
          ...manifest,
          created_at: new Date().toISOString(),
          version: '1.0',
        },
      };

      // Assign super_admin if no role set yet (first user doing onboarding)
      if (!existingProfile?.role || existingProfile.role === 'viewer') {
        updateData.role = 'super_admin';
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update(updateData as any)
        .eq('id', user.id);

      if (profileError) {
        console.error('[Onboarding] Profile update error:', profileError);
        throw profileError;
      }

      console.log('[Onboarding] Profile updated successfully');

      // 2. Create selected collections
      const selectedPresets = COLLECTION_PRESETS.filter(preset =>
        manifest.collections_preset.includes(preset.id)
      );

      // Create all collections in parallel
      const results = await Promise.allSettled(
        selectedPresets.map(preset =>
          supabase.from('collections').insert({
            name: preset.name,
            slug: preset.slug,
            description: preset.description,
            type: preset.type,
            icon: preset.icon,
            color: preset.color,
            fields: preset.fields,
            created_by: user.id,
          })
        )
      );

      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error));
      if (failed.length > 0 && failed.length === selectedPresets.length) {
        throw new Error(`Failed to create collections. Please check your permissions.`);
      }

      // 3. Ensure API key exists (create if missing)
      try {
        const { data: existingKeys } = await supabase
          .from('api_keys')
          .select('id')
          .eq('profile_id', user.id)
          .is('revoked_at', null)
          .limit(1);

        if (!existingKeys || existingKeys.length === 0) {
          const { data: keyResult } = await supabase.rpc('generate_api_key') as { data: string | null; error: any };
          if (keyResult) {
            const { data: hashResult } = await supabase.rpc('hash_api_key', { key_value: keyResult }) as { data: string | null; error: any };
            const { data: prefixResult } = await supabase.rpc('get_key_prefix', { key_value: keyResult }) as { data: string | null; error: any };
            if (hashResult && prefixResult) {
              await supabase.from('api_keys').insert({
                profile_id: user.id,
                name: 'Default API Key',
                key_hash: hashResult,
                key_prefix: prefixResult,
              } as any);
              console.log('[Onboarding] API key created successfully');
            }
          }
        } else {
          console.log('[Onboarding] API key already exists, skipping');
        }
      } catch (keyErr) {
        console.warn('[Onboarding] API key creation failed (non-blocking):', keyErr);
      }

      // Redirect — partial success is OK (some may already exist)
      window.location.href = '/';
    } catch (err) {
      console.error('[Onboarding] Error:', err);
      console.error('[Onboarding] Failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Define Your Project
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Tell us about your project. This will help us customize your CMS experience.
            </p>

            <FormGroup>
              <label htmlFor="name">Project Name *</label>
              <input
                id="name"
                type="text"
                value={manifest.name}
                onChange={e => setManifest({ ...manifest, name: e.target.value })}
                placeholder="My Awesome Website"
                required
              />
            </FormGroup>

            <FormGroup>
              <label>Brand Color</label>
              <ColorPicker>
                {BRAND_COLORS.map(color => (
                  <ColorOption
                    key={color.value}
                    type="button"
                    $color={color.value}
                    $selected={manifest.brand_color === color.value}
                    onClick={() => setManifest({ ...manifest, brand_color: color.value })}
                    title={color.name}
                  />
                ))}
              </ColorPicker>
            </FormGroup>

            <FormGroup>
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={manifest.description}
                onChange={e => setManifest({ ...manifest, description: e.target.value })}
                placeholder="A brief description of your project..."
              />
              <div className="help-text">This will be used in meta tags and search engines</div>
            </FormGroup>

            <FormGroup>
              <label htmlFor="industry">Industry</label>
              <select
                id="industry"
                value={manifest.industry}
                onChange={e => setManifest({ ...manifest, industry: e.target.value })}
              >
                <option value="">Select an industry</option>
                <option value="Technology">Technology</option>
                <option value="Tourism">Tourism & Travel</option>
                <option value="Design">Design & Creative</option>
                <option value="E-commerce">E-commerce</option>
                <option value="Education">Education</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Finance">Finance</option>
                <option value="Other">Other</option>
              </select>
            </FormGroup>
          </div>
        );

      case 1:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Choose Your Collections
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Select the types of content you want to manage. You can add more later.
            </p>

            <PresetGrid>
              {COLLECTION_PRESETS.map(preset => {
                const Icon = ICON_MAP[preset.icon] || FileText;
                const isSelected = manifest.collections_preset.includes(preset.id);

                return (
                  <PresetCard
                    key={preset.id}
                    type="button"
                    $selected={isSelected}
                    onClick={() => togglePreset(preset.id)}
                  >
                    <div className="icon">
                      <Icon size={20} />
                    </div>
                    <h3>{preset.name}</h3>
                    <p>{preset.description}</p>
                    {isSelected && (
                      <div className="check-mark">
                        <Check size={16} />
                      </div>
                    )}
                  </PresetCard>
                );
              })}
            </PresetGrid>
          </div>
        );

      case 2:
        return (
          <div>
            <h2 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] }}>
              Configure Your CMS
            </h2>
            <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[600], marginBottom: spacing[6] }}>
              Final technical settings for your CMS.
            </p>

            <FormGroup>
              <label htmlFor="timezone">Time Zone</label>
              <select
                id="timezone"
                value={manifest.timezone}
                onChange={e => setManifest({ ...manifest, timezone: e.target.value })}
              >
                <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
                <option value="Europe/London">Europe/London (GMT+0)</option>
                <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
                <option value="America/New_York">America/New York (GMT-5)</option>
                <option value="America/Los_Angeles">America/Los Angeles (GMT-8)</option>
              </select>
            </FormGroup>

            <FormGroup>
              <label htmlFor="language">Default Language</label>
              <select
                id="language"
                value={manifest.language}
                onChange={e => setManifest({ ...manifest, language: e.target.value })}
              >
                <option value="en">English</option>
                <option value="pt">Português</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
              </select>
            </FormGroup>

            <div
              style={{
                padding: spacing[4],
                background: colors.accent[50],
                border: `1px solid ${colors.accent[200]}`,
                borderRadius: borders.radius.lg,
                marginTop: spacing[6],
              }}
            >
              <h3 style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, marginBottom: spacing[2] }}>
                📦 Ready to Go!
              </h3>
              <p style={{ fontSize: typography.fontSize.sm, color: colors.gray[700], margin: 0 }}>
                Click "Complete Setup" to create your collections and start using kibanCMS.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    if (currentStep === 0) {
      return manifest.name.trim().length > 0;
    }
    if (currentStep === 1) {
      return manifest.collections_preset.length > 0;
    }
    return true;
  };

  return (
    <Container>
      <Card>
        <Header>
          <div className="icon-wrapper">
            <Sparkles size={32} />
          </div>
          <h1>Welcome to kibanCMS</h1>
          <p>Let's set up your project in just a few steps</p>
        </Header>

        <StepIndicator>
          {Array.from({ length: totalSteps }).map((_, index) => (
            <Step key={index} $active={index === currentStep} $completed={index < currentStep} />
          ))}
        </StepIndicator>

        <Content>{renderStep()}</Content>

        <Footer>
          <Button type="button" onClick={handleBack} disabled={currentStep === 0}>
            <ArrowLeft size={18} />
            Back
          </Button>

          {currentStep < totalSteps - 1 ? (
            <Button type="button" $variant="primary" onClick={handleNext} disabled={!canProceed()}>
              Next
              <ArrowRight size={18} />
            </Button>
          ) : (
            <Button type="button" $variant="primary" onClick={handleComplete} disabled={loading || !canProceed()}>
              {loading ? 'Setting up...' : 'Complete Setup'}
              <Check size={18} />
            </Button>
          )}
        </Footer>
      </Card>
    </Container>
  );
};
