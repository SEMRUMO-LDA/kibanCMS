import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import styled from 'styled-components';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Image as ImageIcon, Code, Heading1, Heading2, Strikethrough } from 'lucide-react';
import { colors, spacing, typography, borders, animations } from '../../shared/styles/design-tokens';
import { FieldWrapper } from './FieldWrapper';

const EditorContainer = styled.div`
  border: 1px solid ${colors.gray[300]};
  border-radius: ${borders.radius.lg};
  overflow: hidden;
  background: ${colors.white};
  transition: border-color ${animations.duration.fast} ${animations.easing.out};
  &:focus-within {
    border-color: ${colors.accent[500]};
    box-shadow: 0 0 0 3px ${colors.accent[500]}20;
  }
`;

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${spacing[1]};
  padding: ${spacing[2]} ${spacing[3]};
  background: ${colors.gray[50]};
  border-bottom: 1px solid ${colors.gray[200]};
`;

const ToolbarButton = styled.button<{ $active?: boolean }>`
  padding: ${spacing[2]};
  background: ${props => props.$active ? colors.accent[100] : 'transparent'};
  border: none;
  border-radius: ${borders.radius.md};
  cursor: pointer;
  color: ${props => props.$active ? colors.accent[700] : colors.gray[700]};
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${animations.duration.fast} ${animations.easing.out};
  &:hover {
    background: ${props => props.$active ? colors.accent[200] : colors.gray[200]};
  }
  svg {
    width: 18px;
    height: 18px;
  }
`;

const Divider = styled.div`
  width: 1px;
  background: ${colors.gray[300]};
  margin: 0 ${spacing[1]};
`;

const EditorContentWrapper = styled.div`
  padding: ${spacing[4]};
  min-height: 200px;
  max-height: 500px;
  overflow-y: auto;

  .ProseMirror {
    outline: none;
    font-size: ${typography.fontSize.base};
    line-height: ${typography.lineHeight.relaxed};
    color: ${colors.gray[900]};
    > * + * {
      margin-top: 0.75em;
    }
    h1 {
      font-size: ${typography.fontSize['3xl']};
      font-weight: ${typography.fontWeight.bold};
      line-height: ${typography.lineHeight.tight};
    }
    h2 {
      font-size: ${typography.fontSize['2xl']};
      font-weight: ${typography.fontWeight.bold};
      line-height: ${typography.lineHeight.tight};
    }
    p.is-editor-empty:first-child::before {
      color: ${colors.gray[400]};
      content: attr(data-placeholder);
      float: left;
      height: 0;
      pointer-events: none;
    }
    ul, ol {
      padding-left: 1.5em;
    }
    ul {
      list-style-type: disc;
    }
    ol {
      list-style-type: decimal;
    }
    code {
      background: ${colors.gray[100]};
      color: ${colors.gray[900]};
      padding: 0.2em 0.4em;
      border-radius: ${borders.radius.sm};
      font-size: 0.9em;
      font-family: ${typography.fontFamily.mono};
    }
    pre {
      background: ${colors.gray[900]};
      color: ${colors.gray[100]};
      padding: ${spacing[4]};
      border-radius: ${borders.radius.md};
      overflow-x: auto;
      code {
        background: none;
        color: inherit;
        padding: 0;
      }
    }
    a {
      color: ${colors.accent[600]};
      text-decoration: underline;
      &:hover {
        color: ${colors.accent[700]};
      }
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: ${borders.radius.md};
      margin: ${spacing[2]} 0;
    }
    strong {
      font-weight: ${typography.fontWeight.semibold};
    }
    s {
      text-decoration: line-through;
    }
  }
`;

interface RichTextFieldProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  error?: string;
}

export function RichTextField({ name, label, value, onChange, placeholder = 'Write something...', required, disabled, helpText, error }: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable link from StarterKit to avoid duplicate
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editable: !disabled,
  });

  if (!editor) {
    return null;
  }

  const addLink = () => {
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const addImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <FieldWrapper label={label} name={name} required={required} helpText={helpText} error={error}>
      <EditorContainer>
        <Toolbar>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} $active={editor.isActive('bold')} title="Bold" type="button">
            <Bold />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} $active={editor.isActive('italic')} title="Italic" type="button">
            <Italic />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} $active={editor.isActive('strike')} title="Strikethrough" type="button">
            <Strikethrough />
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} $active={editor.isActive('heading', { level: 1 })} title="Heading 1" type="button">
            <Heading1 />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} $active={editor.isActive('heading', { level: 2 })} title="Heading 2" type="button">
            <Heading2 />
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} $active={editor.isActive('bulletList')} title="Bullet List" type="button">
            <List />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} $active={editor.isActive('orderedList')} title="Numbered List" type="button">
            <ListOrdered />
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={addLink} $active={editor.isActive('link')} title="Add Link" type="button">
            <LinkIcon />
          </ToolbarButton>
          <ToolbarButton onClick={addImage} title="Add Image" type="button">
            <ImageIcon />
          </ToolbarButton>
          <Divider />
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} $active={editor.isActive('codeBlock')} title="Code Block" type="button">
            <Code />
          </ToolbarButton>
        </Toolbar>
        <EditorContentWrapper>
          <EditorContent editor={editor} />
        </EditorContentWrapper>
      </EditorContainer>
    </FieldWrapper>
  );
}
