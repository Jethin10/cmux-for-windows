import { Notification as ElectronNotification } from "electron";
import type { Notification } from "@cmux/shared";

export interface DesktopNotificationService {
  show(notification: Notification): void;
}

export class ElectronDesktopNotificationService implements DesktopNotificationService {
  show(notification: Notification): void {
    if (!ElectronNotification.isSupported()) return;
    new ElectronNotification({
      title: notification.title,
      body: notification.body,
      silent: notification.severity !== "attention" && notification.severity !== "error",
    }).show();
  }
}
