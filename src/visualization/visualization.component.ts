
import { Component, ChangeDetectionStrategy, input, ElementRef, viewChild, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AutomationSuggestion } from '../services/gemini.service';
import * as d3 from 'd3';

interface ChartData {
  area: string;
  hoursSaved: number;
}

@Component({
  selector: 'app-visualization',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-slate-800/50 border border-slate-700 rounded-xl shadow-md p-6 mb-6">
      <h3 class="text-xl font-bold text-white mb-4">Potential Weekly Time Savings</h3>
      @if (chartData().length > 0) {
        <div #chartContainer class="w-full"></div>
      } @else {
        <div class="flex items-center justify-center h-60 bg-slate-900/40 rounded-lg">
          <p class="text-slate-400">No quantifiable time-saving benefits found to visualize.</p>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VisualizationComponent {
  suggestions = input.required<AutomationSuggestion[] | null>();
  chartContainer = viewChild<ElementRef<HTMLDivElement>>('chartContainer');

  chartData = computed<ChartData[]>(() => {
    const suggestions = this.suggestions();
    if (!suggestions) return [];
    
    return suggestions
    .map(s => ({
        area: s.area,
        hoursSaved: this.parseBenefitToWeeklyHours(s.benefit)
    }))
    .filter(s => s.hoursSaved > 0)
    .sort((a, b) => b.hoursSaved - a.hoursSaved);
  });

  constructor() {
    effect(() => {
      const data = this.chartData();
      const container = this.chartContainer();
      if (container && data.length > 0) {
        this.createChart(data);
      }
    });
  }

  private parseBenefitToWeeklyHours(benefit: string): number {
    const text = benefit.toLowerCase();
    const numbers = benefit.match(/(\d+(\.\d+)?)/);
    if (!numbers) return 0;
    
    const value = parseFloat(numbers[0]);
    
    if (text.includes('hour') || text.includes('hr')) {
      if (text.includes('per day') || text.includes('daily')) return value * 5; // 5-day work week
      if (text.includes('per month') || text.includes('monthly')) return value / 4;
      return value; // Assume weekly if not specified
    }
    
    if (text.includes('minute') || text.includes('min')) {
      const hours = value / 60;
      if (text.includes('per day') || text.includes('daily')) return hours * 5;
      if (text.includes('per month') || text.includes('monthly')) return hours / 4;
      return hours; // Assume weekly
    }
    
    return 0;
  }
  
  private createChart(data: ChartData[]): void {
    const containerEl = this.chartContainer()?.nativeElement;
    if (!containerEl) return;

    d3.select(containerEl).select('svg').remove();

    const margin = { top: 20, right: 50, bottom: 40, left: 150 };
    const width = containerEl.clientWidth - margin.left - margin.right;
    const height = data.length * 35 + margin.top + margin.bottom; 
    
    d3.select(containerEl).style('height', `${height}px`);

    const svg = d3.select(containerEl)
      .append('svg')
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${width + margin.left + margin.right} ${height}`)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const y = d3.scaleBand()
      .range([0, height - margin.top - margin.bottom])
      .domain(data.map(d => this.truncateLabel(d.area, 20)))
      .padding(0.2);
      
    svg.append('g')
      .call(d3.axisLeft(y).tickSize(0))
      .call(g => g.select(".domain").remove())
      .selectAll('text')
        .style('fill', '#cbd5e1') // slate-300
        .style('font-size', '13px');

    const x = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.hoursSaved) || 10])
      .range([0, width]);
      
    svg.append('g')
      .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(0))
      .call(g => g.select(".domain").remove())
      .selectAll('text')
        .style('fill', '#94a3b8') // slate-400
        .style('font-size', '12px');

    svg.selectAll('myRect')
      .data(data)
      .join('rect')
      .attr('x', x(0))
      .attr('y', d => y(this.truncateLabel(d.area, 20)) as number)
      .attr('width', d => x(d.hoursSaved))
      .attr('height', y.bandwidth())
      .attr('fill', '#6366f1'); // indigo-500
      
    svg.selectAll('.bar-label')
      .data(data)
      .join('text')
      .attr('class', 'bar-label')
      .attr('x', d => x(d.hoursSaved) + 5)
      .attr('y', d => (y(this.truncateLabel(d.area, 20)) as number) + y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .style('fill', '#f1f5f9') // slate-100
      .style('font-size', '12px')
      .style('font-weight', '500')
      .text(d => `${d.hoursSaved.toFixed(1)} hrs`);
  }

  private truncateLabel(label: string, maxLength: number): string {
    if (label.length <= maxLength) return label;
    return label.substring(0, maxLength).trim() + '...';
  }
}
