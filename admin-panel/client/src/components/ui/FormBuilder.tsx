import React, { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { Plus, Trash2, GripVertical, Eye, Code, Save } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';
import { Card } from './Card';
import { Badge } from './Badge';
import { Modal } from './Modal';

export type FieldType = 
  | 'text' 
  | 'email' 
  | 'password' 
  | 'number' 
  | 'textarea' 
  | 'select' 
  | 'checkbox' 
  | 'radio' 
  | 'date' 
  | 'file' 
  | 'url' 
  | 'tel';

export interface FormField {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  conditional?: {
    field: string;
    value: any;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  };
  styling?: {
    width?: 'full' | 'half' | 'third' | 'quarter';
    className?: string;
  };
}

export interface FormBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  onSave?: (fields: FormField[]) => void;
  onPreview?: (fields: FormField[]) => void;
  className?: string;
}

const fieldTypes: Array<{ type: FieldType; label: string; icon: string }> = [
  { type: 'text', label: 'Text Input', icon: '📝' },
  { type: 'email', label: 'Email', icon: '📧' },
  { type: 'password', label: 'Password', icon: '🔒' },
  { type: 'number', label: 'Number', icon: '🔢' },
  { type: 'textarea', label: 'Text Area', icon: '📄' },
  { type: 'select', label: 'Select', icon: '📋' },
  { type: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { type: 'radio', label: 'Radio', icon: '🔘' },
  { type: 'date', label: 'Date', icon: '📅' },
  { type: 'file', label: 'File Upload', icon: '📁' },
  { type: 'url', label: 'URL', icon: '🔗' },
  { type: 'tel', label: 'Phone', icon: '📞' },
];

export const FormBuilder: React.FC<FormBuilderProps> = ({
  fields,
  onChange,
  onSave,
  onPreview,
  className
}) => {
  const [selectedField, setSelectedField] = useState<FormField | null>(null);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [draggedField, setDraggedField] = useState<string | null>(null);

  const addField = (type: FieldType) => {
    const newField: FormField = {
      id: `field_${Date.now()}`,
      type,
      label: `${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
      required: false,
      styling: { width: 'full' }
    };

    if (type === 'select' || type === 'radio') {
      newField.options = ['Option 1', 'Option 2'];
    }

    onChange([...fields, newField]);
    setShowFieldModal(false);
  };

  const updateField = (updatedField: FormField) => {
    const updatedFields = fields.map(field =>
      field.id === updatedField.id ? updatedField : field
    );
    onChange(updatedFields);
    setSelectedField(null);
  };

  const deleteField = (fieldId: string) => {
    const updatedFields = fields.filter(field => field.id !== fieldId);
    onChange(updatedFields);
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    const updatedFields = [...fields];
    const [movedField] = updatedFields.splice(fromIndex, 1);
    updatedFields.splice(toIndex, 0, movedField);
    onChange(updatedFields);
  };

  const handleDragStart = (fieldId: string) => {
    setDraggedField(fieldId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!draggedField) return;

    const draggedIndex = fields.findIndex(field => field.id === draggedField);
    if (draggedIndex !== -1) {
      moveField(draggedIndex, targetIndex);
    }
    setDraggedField(null);
  };

  const renderFieldPreview = (field: FormField) => {
    const baseProps = {
      id: field.id,
      placeholder: field.placeholder,
      required: field.required,
      className: clsx(
        'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500',
        field.styling?.className
      )
    };

    switch (field.type) {
      case 'text':
      case 'email':
      case 'password':
      case 'url':
      case 'tel':
        return <Input {...baseProps} type={field.type} />;

      case 'number':
        return (
          <Input
            {...baseProps}
            type="number"
            min={field.validation?.min}
            max={field.validation?.max}
          />
        );

      case 'textarea':
        return (
          <textarea
            {...baseProps}
            rows={3}
            className={clsx(baseProps.className, 'resize-none')}
          />
        );

      case 'select':
        return (
          <select {...baseProps}>
            <option value="">Select an option</option>
            {field.options?.map((option, index) => (
              <option key={index} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {field.options?.map((option, index) => (
              <label key={index} className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded mr-2"
                  value={option}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option, index) => (
              <label key={index} className="flex items-center">
                <input
                  type="radio"
                  name={field.id}
                  className="mr-2"
                  value={option}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );

      case 'date':
        return <Input {...baseProps} type="date" />;

      case 'file':
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input type="file" className="hidden" id={field.id} />
            <label
              htmlFor={field.id}
              className="cursor-pointer text-gray-600 hover:text-gray-800"
            >
              Click to upload or drag and drop
            </label>
          </div>
        );

      default:
        return <Input {...baseProps} />;
    }
  };

  const getWidthClass = (width: string) => {
    switch (width) {
      case 'half': return 'w-1/2';
      case 'third': return 'w-1/3';
      case 'quarter': return 'w-1/4';
      default: return 'w-full';
    }
  };

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center space-x-2">
          <Button
            onClick={() => setShowFieldModal(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Add Field</span>
          </Button>
          
          <Button
            variant="outline"
            onClick={() => onPreview?.(fields)}
            className="flex items-center space-x-2"
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </Button>
        </div>

        <div className="flex items-center space-x-2">
          <Badge variant="info" size="sm">
            {fields.length} fields
          </Badge>
          
          {onSave && (
            <Button
              onClick={() => onSave(fields)}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>Save Form</span>
            </Button>
          )}
        </div>
      </div>

      {/* Form Fields */}
      <div className="space-y-4">
        {fields.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="text-gray-500">
              <div className="text-4xl mb-4">📝</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No fields yet</h3>
              <p className="text-gray-600 mb-4">Start building your form by adding fields</p>
              <Button onClick={() => setShowFieldModal(true)}>
                Add Your First Field
              </Button>
            </div>
          </Card>
        ) : (
          fields.map((field, index) => (
            <Card
              key={field.id}
              className={clsx(
                'p-4 border-2 border-dashed border-gray-200 hover:border-blue-300 transition-colors',
                selectedField?.id === field.id && 'border-blue-500'
              )}
              draggable
              onDragStart={() => handleDragStart(field.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 pt-2">
                  <GripVertical className="h-4 w-4 text-gray-400 cursor-move" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline" size="sm">
                        {field.type}
                      </Badge>
                      {field.required && (
                        <Badge variant="destructive" size="sm">
                          Required
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedField(field)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteField(field.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className={getWidthClass(field.styling?.width || 'full')}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {renderFieldPreview(field)}
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add Field Modal */}
      <Modal
        isOpen={showFieldModal}
        onClose={() => setShowFieldModal(false)}
        title="Add Field"
        size="lg"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {fieldTypes.map((fieldType) => (
            <button
              key={fieldType.type}
              onClick={() => addField(fieldType.type)}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
            >
              <div className="text-2xl mb-2">{fieldType.icon}</div>
              <div className="font-medium text-gray-900">{fieldType.label}</div>
            </button>
          ))}
        </div>
      </Modal>

      {/* Field Editor Modal */}
      <Modal
        isOpen={!!selectedField}
        onClose={() => setSelectedField(null)}
        title="Edit Field"
        size="lg"
      >
        {selectedField && (
          <FieldEditor
            field={selectedField}
            onSave={updateField}
            onCancel={() => setSelectedField(null)}
          />
        )}
      </Modal>
    </div>
  );
};

// Field Editor Component
interface FieldEditorProps {
  field: FormField;
  onSave: (field: FormField) => void;
  onCancel: () => void;
}

const FieldEditor: React.FC<FieldEditorProps> = ({ field, onSave, onCancel }) => {
  const [editedField, setEditedField] = useState<FormField>({ ...field });

  const handleSave = () => {
    onSave(editedField);
  };

  const addOption = () => {
    setEditedField(prev => ({
      ...prev,
      options: [...(prev.options || []), 'New Option']
    }));
  };

  const updateOption = (index: number, value: string) => {
    setEditedField(prev => ({
      ...prev,
      options: prev.options?.map((option, i) => i === index ? value : option)
    }));
  };

  const removeOption = (index: number) => {
    setEditedField(prev => ({
      ...prev,
      options: prev.options?.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Field Label
        </label>
        <Input
          value={editedField.label}
          onChange={(e) => setEditedField(prev => ({ ...prev, label: e.target.value }))}
          placeholder="Enter field label"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Placeholder
        </label>
        <Input
          value={editedField.placeholder || ''}
          onChange={(e) => setEditedField(prev => ({ ...prev, placeholder: e.target.value }))}
          placeholder="Enter placeholder text"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="required"
          checked={editedField.required || false}
          onChange={(e) => setEditedField(prev => ({ ...prev, required: e.target.checked }))}
          className="rounded mr-2"
        />
        <label htmlFor="required" className="text-sm text-gray-700">
          Required field
        </label>
      </div>

      {(editedField.type === 'select' || editedField.type === 'radio' || editedField.type === 'checkbox') && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Options
          </label>
          <div className="space-y-2">
            {editedField.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={option}
                  onChange={(e) => updateOption(index, e.target.value)}
                  placeholder="Option text"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeOption(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={addOption}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Width
        </label>
        <select
          value={editedField.styling?.width || 'full'}
          onChange={(e) => setEditedField(prev => ({
            ...prev,
            styling: { ...prev.styling, width: e.target.value as any }
          }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="full">Full Width</option>
          <option value="half">Half Width</option>
          <option value="third">Third Width</option>
          <option value="quarter">Quarter Width</option>
        </select>
      </div>

      <div className="flex justify-end space-x-3">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};
