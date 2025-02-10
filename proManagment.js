import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getOngoingProjects from '@salesforce/apex/ProjectController.getOngoingProjects';
import getNsProjects from '@salesforce/apex/ProjectController.getNsProjects';
import getCompletedProjects from '@salesforce/apex/ProjectController.getCompletedProjects';
import saveProject from '@salesforce/apex/ProjectController.saveProject';
import deleteProject from '@salesforce/apex/ProjectController.deleteProject';
import getStagePicklistValues from '@salesforce/apex/ProjectController.getStagePicklistValues';
import { refreshApex } from '@salesforce/apex';
import { NavigationMixin } from 'lightning/navigation';


export default class ProjectManagement extends LightningElement {
    @track ongoingProjects = [];
    @track notStartedProjects = [];
    @track completedProjects = [];
    @track columns = [
        { label: 'Project Name', fieldName: 'Name', type: 'text', sortable: true, editable: true },
        { label: 'Status', fieldName: 'Status__c', type: 'text', sortable: true, editable: true },
        { label: 'Start Date', fieldName: 'Start_Date__c', type: 'date', sortable: true, editable: true },
        { label: 'End Date', fieldName: 'End_Date__c', type: 'date', sortable: true, editable: true },
        { label: 'Deadline Days', fieldName: 'DeadLine_Days__c', type: 'number' },
        { type: 'button', typeAttributes: { label: 'Edit', iconName: 'utility:edit', name: 'edit', title: 'Edit Project', value: 'edit' } },
        { type: 'button', typeAttributes: { label: 'Delete', iconName: 'utility:delete', name: 'delete', title: 'Delete Project', value: 'delete' } },
    ];

    @track currentPage = 1;
    @track pageSize = 5;
    @track totalPages = 0;
    @track paginatedProjects = [];

    @track projectToEdit = {};
    @track isEditing = false;
    @track statusOptions = [];
    @track selectedStatus = '';
    @track draftValues = [];
    sortBy;
    sortDirection;

    wiredOngoingProjects;
    wiredNsProjects;
    wiredCompletedProjects;

    @wire(getOngoingProjects)
    wiredOngoingProjects(result) {
        this.wiredOngoingProjects = result;
        if (result.data) {
            this.ongoingProjects = result.data;
            this.updatePagination();
        } else if (result.error) {
            this.ongoingProjects = [];
        }
    }

    @wire(getNsProjects)
    wiredNsProjects(result) {
        this.wiredNsProjects = result;
        if (result.data) {
            this.notStartedProjects = result.data;
            this.updatePagination();
        } else if (result.error) {
            this.notStartedProjects = [];
        }
    }

    @wire(getCompletedProjects)
    wiredCompletedProjects(result) {
        this.wiredCompletedProjects = result;
        if (result.data) {
            this.completedProjects = result.data;
            this.updatePagination();
        } else if (result.error) {
            this.completedProjects = [];
        }
    }

    @wire(getStagePicklistValues)
    wiredStatusPicklistValues({ error, data }) {
        if (data) {
            this.statusOptions = data.map(status => ({ label: status, value: status }));
        } else if (error) {
            this.statusOptions = [];
        }
    }

    

    get filteredProjects() {
        let projects;
        switch (this.selectedStatus) {
            case 'Ongoing':
                projects = this.ongoingProjects;
                break;
            case 'Not Started':
                projects = this.notStartedProjects;
                break;
            case 'Completed':
                projects = this.completedProjects;
                break;
            default:
                projects = [...this.ongoingProjects, ...this.notStartedProjects, ...this.completedProjects];
        }
        return this.sortData(projects);
    }

     handleCloneProject() {
        cloneProject({ projectId: this.recordId })
            .then((result) => {
                this.showToast('Success', 'Project cloned successfully', 'success');
                
                this[NavigationMixin.Navigate]({
                    type: 'standard__recordPage',
                    attributes: {
                        recordId: result.Id,
                        objectApiName: 'Project__c',
                        actionName: 'view'
                    }
                });
            })
            .catch((error) => {
                this.showToast('Error', 'Failed to clone project', 'error');
                console.error('Error cloning project:', error);
            });
    }

     handleCellChange(event) {
        const updatedFields = event.detail.draftValues;

        saveProjectChanges({ data: updatedFields })
            .then(() => {
                this.draftValues = [];
                return refreshApex(this.projects);
            })
            .catch(error => {
                console.error('Error saving changes:', error);
            });
    }

    updatePagination() {
        this.totalPages = Math.ceil(this.filteredProjects.length / this.pageSize);
        this.paginatedProjects = this.filteredProjects.slice(
            (this.currentPage - 1) * this.pageSize,
            this.currentPage * this.pageSize
        );
    }

    handlePageChange(event) {
        if (event.target.label === 'Previous') {
            this.currentPage = Math.max(1, this.currentPage - 1);
        } else if (event.target.label === 'Next') {
            this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
        }
        this.updatePagination();
    }

    handleStatusChange(event) {
        this.selectedStatus = event.target.value;
        this.currentPage = 1; 
        this.updatePagination();
    }

  handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        if (actionName === 'delete') {
            deleteProject({ projectId: row.Id })
                .then(() => {
                    this.showNotification('Success', 'Project deleted successfully', 'success');
                    return refreshApex(this.wiredProjectsResult);
                })
                .catch(error => {
                    this.showNotification('Error', 'Failed to delete project: ' + error.body.message, 'error');
                });
        } else if (actionName === 'edit') {
            this.newProject = { ...row };
            this.isEditing = true;
        }
    }

    editProject(project) {
        this.projectToEdit = { ...project };
        this.isEditing = true;
    }

    deleteProject(projectId) {
        deleteProject({ projectId })
            .then(() => {
                this.showToast('Success', 'Project deleted successfully', 'success');
                return Promise.all([ 
                    refreshApex(this.wiredOngoingProjects),
                    refreshApex(this.wiredNsProjects),
                    refreshApex(this.wiredCompletedProjects)
                ]);
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    handleInputChange(event) {
        const field = event.target.name;
        this.projectToEdit[field] = event.target.value;
    }

    saveProject() {
        saveProject({ project: this.projectToEdit })
        
            .then(() => {
                this.showToast('Success', 'Project saved successfully', 'success');
                this.isEditing = false;
                this.projectToEdit = {};
                this.draftValues = [];
                return Promise.all([
                    refreshApex(this.wiredOngoingProjects),
                    refreshApex(this.wiredNsProjects),
                    refreshApex(this.wiredCompletedProjects)
                ]);
            })
            .catch(error => {
                this.showToast('Error', error.body.message, 'error');
            });
    }

    handleNewProject() {
        this.projectToEdit = { Name: '', Status__c: '', Start_Date__c: '', End_Date__c: '', DeadLine_Days__c: 0 };
        this.isEditing = true;
    }

    handleCancel() {
        this.isEditing = false;
        this.projectToEdit = {};
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({ title, message, variant });
        this.dispatchEvent(evt);
    }

    updateColumnSorting(event) {
        this.sortBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;
        this.updatePagination();
    }

    
    exportToCSV() {
        const csvColumns = ['Name', 'Status__c', 'Start_Date__c', 'End_Date__c', 'DeadLine_Days__c'];
        let csvContent = 'data:text/csv;charset=utf-8,' + csvColumns.join(',') + '\n';

        this.filteredProjects.forEach(project => {
            const row = csvColumns.map(column => project[column]).join(',');
            csvContent += row + '\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', 'projects.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    sortData(data) {
        if (!this.sortBy || !this.sortDirection) {
            return data;
        }

        const sortedData = [...data];
        sortedData.sort((a, b) => {
            let aVal = a[this.sortBy] || '';
            let bVal = b[this.sortBy] || '';

            if (this.sortBy === 'Start_Date__c' || this.sortBy === 'End_Date__c') {
                aVal = new Date(aVal);
                bVal = new Date(bVal);
            }

            let compare = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            return this.sortDirection === 'asc' ? compare : -compare;
        });

        return sortedData;
    }

    handleCellChange(event) {
        const draftValues = event.detail.draftValues;

        draftValues.forEach(draft => {
            const index = this.paginatedProjects.findIndex(project => project.Id === draft.Id);
            if (index !== -1) {
                this.paginatedProjects[index] = { ...this.paginatedProjects[index], ...draft };
            }
        });

        this.draftValues = [...draftValues];
    }
}