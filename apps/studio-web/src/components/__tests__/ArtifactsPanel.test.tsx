import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactsPanel } from '../ArtifactsPanel';

describe('ArtifactsPanel', () => {
  it('renders empty state', () => {
    render(<ArtifactsPanel artifacts={[]} loading={false} onDownloadOne={vi.fn()} onDownloadAll={vi.fn()} />);
    expect(screen.getByText(/暂无输出产物/)).toBeInTheDocument();
  });

  it('triggers single download', () => {
    const onDownloadOne = vi.fn();
    render(
      <ArtifactsPanel
        artifacts={[{ id: 'req-md', category: 'requirement', label: '需求文档.md', updatedAt: Date.now(), source: 'session-state' }]}
        loading={false}
        onDownloadOne={onDownloadOne}
        onDownloadAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('下载'));
    expect(onDownloadOne).toHaveBeenCalledWith('req-md');
  });

  it('triggers download all', () => {
    const onDownloadAll = vi.fn();
    render(
      <ArtifactsPanel
        artifacts={[{ id: 'req-md', category: 'requirement', label: '需求文档.md', updatedAt: Date.now(), source: 'session-state' }]}
        loading={false}
        onDownloadOne={vi.fn()}
        onDownloadAll={onDownloadAll}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /打包下载全部/ }));
    expect(onDownloadAll).toHaveBeenCalled();
  });
});
