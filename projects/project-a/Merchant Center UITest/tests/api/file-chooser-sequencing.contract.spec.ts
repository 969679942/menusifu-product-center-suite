import { expect, test } from '@playwright/test';
import { selectFileThroughChooser } from '../../utils/file-chooser-sequencing';

test.describe('文件选择器交互时序合同', () => {
  test('应在等待触发点击完成前先向文件选择器设置文件', async () => {
    const events: string[] = [];
    let resolveChooser!: (chooser: { setFiles: (filePath: string) => Promise<void> }) => void;
    let resolveClick!: () => void;
    const chooserPromise = new Promise<{ setFiles: (filePath: string) => Promise<void> }>((resolve) => {
      resolveChooser = resolve;
    });
    const clickPromise = new Promise<void>((resolve) => {
      resolveClick = resolve;
    });
    const page = {
      waitForFileChooser: async () => chooserPromise,
    };
    const reveal = {
      hover: async () => {
        events.push('hovered');
      },
    };
    const trigger = {
      click: async () => {
        events.push('click-started');
        resolveChooser({
          setFiles: async (filePath: string) => {
            events.push(`file-set:${filePath}`);
            resolveClick();
          },
        });
        await clickPromise;
        events.push('click-finished');
      },
    };

    await selectFileThroughChooser(page, reveal, trigger, 'wave-d.png');

    expect(events).toEqual([
      'hovered',
      'click-started',
      'file-set:wave-d.png',
      'click-finished',
    ]);
  });
});
