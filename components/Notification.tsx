
import React, { useEffect } from 'react';
import { InfoCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from './Icons';

export type NotificationType = 'success' | 'error' | 'info';

interface NotificationProps {
  message: string;
  type: NotificationType;
  onClose: () => void;
}

const notificationStyles = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    text: 'text-green-800',
    icon: <CheckCircleIcon className="text-green-500" />,
    title: 'Berhasil',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-800',
    icon: <ExclamationTriangleIcon className="text-red-500" />,
    title: 'Gagal',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    text: 'text-blue-800',
    icon: <InfoCircleIcon className="text-blue-500" />,
    title: 'Informasi',
  },
};

const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  const styles = notificationStyles[type];
  
  useEffect(() => {
    if(type !== 'success') {
      return;
    }
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // Auto-close success notifications after 5 seconds

    return () => clearTimeout(timer);
  }, [type, onClose]);

  return (
    <div className={`rounded-md p-4 mb-4 border ${styles.bg} ${styles.border}`}>
      <div className="flex">
        <div className="flex-shrink-0">
          {styles.icon}
        </div>
        <div className="ml-3">
          <h3 className={`text-sm font-medium ${styles.text}`}>{styles.title}</h3>
          <div className={`mt-2 text-sm ${styles.text}`}>
            <p>{message}</p>
          </div>
        </div>
        <div className="ml-auto pl-3">
          <div className="-mx-1.5 -my-1.5">
            <button
              onClick={onClose}
              type="button"
              className={`inline-flex rounded-md p-1.5 ${styles.text} focus:outline-none focus:ring-2 focus:ring-offset-2`}
            >
              <span className="sr-only">Tutup</span>
              <XMarkIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notification;
