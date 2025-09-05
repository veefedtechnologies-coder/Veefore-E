import React, { useState, useRef, useCallback, useEffect } from 'react';
import { clsx } from 'clsx';
import { Upload, File, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export interface FileWithPreview extends File {
  id: string;
  preview?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
  error?: string;
}

export interface DragDropProps {
  onFilesSelect: (files: FileWithPreview[]) => void;
  onFileRemove?: (fileId: string) => void;
  onFileUpload?: (file: FileWithPreview) => Promise<void>;
  accept?: string;
  maxFiles?: number;
  maxSize?: number; // in bytes
  multiple?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const DragDrop: React.FC<DragDropProps> = ({
  onFilesSelect,
  onFileRemove,
  onFileUpload,
  accept,
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = true,
  disabled = false,
  className,
  children
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [dragCounter, setDragCounter] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`;
    }
    
    if (accept) {
      const acceptedTypes = accept.split(',').map(type => type.trim());
      const fileType = file.type;
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      const isAccepted = acceptedTypes.some(type => 
        type === fileType || 
        type === fileExtension ||
        (type.startsWith('.') && fileExtension === type) ||
        (type.endsWith('/*') && fileType.startsWith(type.slice(0, -1)))
      );
      
      if (!isAccepted) {
        return `File type not supported. Accepted types: ${accept}`;
      }
    }
    
    return null;
  };

  const createFileWithPreview = (file: File): FileWithPreview => {
    const fileWithPreview: FileWithPreview = {
      ...file,
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending'
    };

    // Create preview for images
    if (file.type.startsWith('image/')) {
      fileWithPreview.preview = URL.createObjectURL(file);
    }

    return fileWithPreview;
  };

  const handleFiles = useCallback((newFiles: FileList) => {
    if (disabled) return;

    const fileArray = Array.from(newFiles);
    const validFiles: FileWithPreview[] = [];
    const errors: string[] = [];

    fileArray.forEach(file => {
      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
      } else {
        validFiles.push(createFileWithPreview(file));
      }
    });

    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
    }

    if (validFiles.length > 0) {
      const updatedFiles = multiple ? [...files, ...validFiles] : validFiles;
      const limitedFiles = updatedFiles.slice(0, maxFiles);
      
      setFiles(limitedFiles);
      onFilesSelect(limitedFiles);
    }
  }, [files, disabled, multiple, maxFiles, maxSize, accept, onFilesSelect]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
    if (dragCounter <= 1) {
      setIsDragOver(false);
    }
  }, [dragCounter]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    setDragCounter(0);

    if (disabled) return;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      handleFiles(droppedFiles);
    }
  }, [disabled, handleFiles]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      handleFiles(selectedFiles);
    }
  }, [handleFiles]);

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles(prev => {
      const updatedFiles = prev.filter(file => file.id !== fileId);
      onFilesSelect(updatedFiles);
      return updatedFiles;
    });
    onFileRemove?.(fileId);
  }, [onFilesSelect, onFileRemove]);

  const handleUploadFile = useCallback(async (file: FileWithPreview) => {
    if (!onFileUpload) return;

    setFiles(prev => prev.map(f => 
      f.id === file.id ? { ...f, status: 'uploading' } : f
    ));

    try {
      await onFileUpload(file);
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { ...f, status: 'success' } : f
      ));
    } catch (error) {
      setFiles(prev => prev.map(f => 
        f.id === file.id ? { 
          ...f, 
          status: 'error', 
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
    }
  }, [onFileUpload]);

  const openFileDialog = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (file: FileWithPreview) => {
    if (file.type.startsWith('image/')) {
      return <img src={file.preview} alt={file.name} className="w-8 h-8 object-cover rounded" />;
    }
    return <File className="w-8 h-8 text-gray-400" />;
  };

  const getStatusIcon = (file: FileWithPreview) => {
    switch (file.status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'uploading':
        return <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />;
      default:
        return null;
    }
  };

  return (
    <div className={clsx('w-full', className)}>
      {/* Drop Zone */}
      <div
        className={clsx(
          'relative border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400',
          disabled && 'opacity-50 cursor-not-allowed',
          'cursor-pointer'
        )}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileInputChange}
          className="hidden"
          disabled={disabled}
        />
        
        {children || (
          <div className="space-y-4">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div>
              <p className="text-lg font-medium text-gray-900">
                {isDragOver ? 'Drop files here' : 'Drag and drop files here'}
              </p>
              <p className="text-sm text-gray-600">
                or <span className="text-blue-600 hover:text-blue-500">browse files</span>
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {accept && `Accepted formats: ${accept}`}
              {maxSize && ` • Max size: ${Math.round(maxSize / 1024 / 1024)}MB`}
              {maxFiles && ` • Max files: ${maxFiles}`}
            </div>
          </div>
        )}
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-900">
            Selected Files ({files.length})
          </h4>
          <div className="space-y-2">
            {files.map(file => (
              <div
                key={file.id}
                className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
              >
                {getFileIcon(file)}
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.size)}
                  </p>
                  {file.error && (
                    <p className="text-xs text-red-600 mt-1">
                      {file.error}
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  {getStatusIcon(file)}
                  
                  {onFileUpload && file.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => handleUploadFile(file)}
                      disabled={disabled}
                    >
                      Upload
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveFile(file.id)}
                    disabled={disabled}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Sortable list component
export interface SortableItem {
  id: string;
  content: React.ReactNode;
}

export interface SortableListProps {
  items: SortableItem[];
  onReorder: (items: SortableItem[]) => void;
  className?: string;
  disabled?: boolean;
}

export const SortableList: React.FC<SortableListProps> = ({
  items,
  onReorder,
  className,
  disabled = false
}) => {
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    if (disabled) return;
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    if (disabled) return;
    setDragOverItem(itemId);
  };

  const handleDragLeave = () => {
    setDragOverItem(null);
  };

  const handleDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    if (disabled || !draggedItem) return;

    const draggedIndex = items.findIndex(item => item.id === draggedItem);
    const targetIndex = items.findIndex(item => item.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    const newItems = [...items];
    const [draggedItemData] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItemData);

    onReorder(newItems);
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverItem(null);
  };

  return (
    <div className={clsx('space-y-2', className)}>
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable={!disabled}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, item.id)}
          onDragEnd={handleDragEnd}
          className={clsx(
            'p-3 border border-gray-200 rounded-lg cursor-move transition-colors',
            draggedItem === item.id && 'opacity-50',
            dragOverItem === item.id && 'border-blue-400 bg-blue-50',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <div className="flex items-center space-x-3">
            <div className="text-gray-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
              </svg>
            </div>
            <div className="flex-1">
              {item.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Drag and drop zone for reordering
export interface DragDropZoneProps {
  onDrop: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export const DragDropZone: React.FC<DragDropZoneProps> = ({
  onDrop,
  onDragOver,
  onDragLeave,
  className,
  children,
  disabled = false
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(true);
      onDragOver?.(e);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(false);
      onDragLeave?.(e);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragOver(false);
      onDrop(e);
    }
  };

  return (
    <div
      className={clsx(
        'transition-colors',
        isDragOver && !disabled && 'bg-blue-50 border-blue-400',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </div>
  );
};
