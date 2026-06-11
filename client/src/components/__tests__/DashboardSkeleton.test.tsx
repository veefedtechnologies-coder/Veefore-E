/**
 * DashboardSkeleton Component Tests
 * 
 * Tests for the DashboardSkeleton fallback component used during lazy loading.
 */

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import DashboardSkeleton from '../DashboardSkeleton';

describe('DashboardSkeleton', () => {
  it('renders skeleton structure without errors', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container).toBeTruthy();
  });

  it('displays chrome elements (traffic lights and header)', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for traffic lights (3 dots)
    const trafficLights = container.querySelectorAll('.w-3.h-3.rounded-full');
    expect(trafficLights.length).toBeGreaterThanOrEqual(3);
  });

  it('displays sidebar skeleton items', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for sidebar items (5 navigation items)
    const sidebarItems = container.querySelectorAll('.w-48 .h-8');
    expect(sidebarItems.length).toBeGreaterThanOrEqual(5);
  });

  it('displays metric cards skeleton', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for metric cards
    const metricCards = container.querySelectorAll('.rounded-xl.bg-white\\/\\[0\\.02\\]');
    expect(metricCards.length).toBeGreaterThan(0);
  });

  it('displays chart bars skeleton', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for chart bars (12 bars)
    const chartBars = container.querySelectorAll('.from-blue-400\\/20');
    expect(chartBars.length).toBe(12);
  });

  it('displays animated cursor skeleton', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for cursor element
    const cursor = container.querySelector('.bg-blue-400\\/50.blur-sm');
    expect(cursor).toBeTruthy();
  });

  it('matches dashboard dimensions with padding-bottom 60%', () => {
    const { container } = render(<DashboardSkeleton />);
    
    const wrapper = container.querySelector('.relative.w-full');
    expect(wrapper).toHaveStyle({ paddingBottom: '60%' });
  });

  it('applies glass morphism styling matching dashboard', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for backdrop-blur and border styling
    const chrome = container.querySelector('.backdrop-blur-md.border-white\\/10');
    expect(chrome).toBeTruthy();
  });

  it('includes pulse animations on skeleton elements', () => {
    const { container } = render(<DashboardSkeleton />);
    
    // Check for elements with animate-pulse class
    const pulsingElements = container.querySelectorAll('.animate-pulse');
    expect(pulsingElements.length).toBeGreaterThan(0);
  });
});
